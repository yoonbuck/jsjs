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
 * Carries a guest throw completion across host call frames.
 *
 * Completion records describe abrupt completions *within* one evaluator
 * frame, but expression evaluation returns plain values, so a `throw`
 * inside a called function has no completion record to travel through on
 * its way back to the caller. `EngineFunction#callFunction` converts a
 * body's throw completion into this signal, and the script API converts it
 * back into a throw completion at the boundary; `try`/`catch` (implemented
 * in the evaluator's `TryStatement` handling) has exactly one thing to
 * intercept.
 */
export class ThrowSignal extends Error {
  /**
   * @param {unknown} value
   */
  constructor(value) {
    super('Uncaught guest throw completion');
    this.name = 'ThrowSignal';
    /** @type {unknown} */
    this.value = value;
  }
}

/**
 * Carries the intent "throw a guest error of this type" across host call
 * frames without needing a realm reference at the throw site.
 *
 * Engine internals (`object.js`, `reference.js`, `environment.js`) detect
 * a guest-visible failure and throw this signal instead of a bare host
 * `TypeError`/`ReferenceError`, so the error type and message travel
 * alongside the host exception without yet being bound to any realm's
 * intrinsic graph. The first realm-aware boundary that catches it —
 * `EngineFunction#callFunction` or `evaluateScript` — converts it into a
 * proper guest `EngineObject` and wraps it in a `ThrowSignal` (or returns
 * a throw completion directly). Guest code that handles its own errors via
 * `try`/`catch` (implemented in Task 2) will intercept the resulting
 * `ThrowSignal`.
 *
 * The realm-aware boundaries that materialise this signal are:
 * `EngineFunction#callFunction`, `evaluateScript`, and the `runToCompletion`
 * helper in `evaluateTryStatement` (in `src/evaluator/statements.js`).
 *
 * This is intentionally distinct from `ThrowSignal`: a `ThrowSignal`
 * already holds a fully-constructed guest value, whereas `GuestErrorSignal`
 * is a pre-construction token that a realm-aware caller turns into one.
 */
export class GuestErrorSignal extends Error {
  /**
   * @param {'TypeError' | 'ReferenceError' | 'SyntaxError' | 'RangeError' | 'URIError' | 'Error'} typeName
   * @param {string} message
   */
  constructor(typeName, message) {
    super(message);
    this.name = 'GuestErrorSignal';
    /** @type {'TypeError' | 'ReferenceError' | 'SyntaxError' | 'RangeError' | 'URIError' | 'Error'} */
    this.typeName = typeName;
    /** @type {string} */
    this.guestMessage = message;
  }
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
