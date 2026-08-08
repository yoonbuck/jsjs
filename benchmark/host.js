import { createRealm, evaluateScript } from '../src/index.js';

export const runtimeEngine = Object.freeze({
  createRealm,
  evaluateScript,
});

/** @type {WeakMap<() => number, { syntheticTicks: number }>} */
const CLOCK_STATES = new WeakMap();

/**
 * @param {() => number} readNow
 * @returns {() => number}
 */
export function monotonicNowFrom(readNow) {
  let lastNow = Number.NEGATIVE_INFINITY;
  const state = { syntheticTicks: 0 };

  const now = () => {
    const nextNow = readNow();

    if (!Number.isFinite(nextNow)) {
      return nextNow;
    }

    if (nextNow <= lastNow) {
      // A stalled coarse clock only gets nudged to a positive delta here; the
      // resulting epsilon-sized elapsed time is not a measurable benchmark
      // sample, so calibration must grow probes until it clears clock granularity.
      lastNow += Math.max(1, Math.abs(lastNow)) * Number.EPSILON;
      state.syntheticTicks += 1;
      return lastNow;
    }

    lastNow = nextNow;
    return nextNow;
  };

  CLOCK_STATES.set(now, state);
  return now;
}

/**
 * @param {() => number} clock
 * @returns {number}
 */
export function syntheticClockTicksFrom(clock) {
  return CLOCK_STATES.get(clock)?.syntheticTicks ?? 0;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatHostError(error) {
  const description = String(error);
  const stack =
    typeof error === 'object' &&
    error !== null &&
    'stack' in error &&
    typeof error.stack === 'string'
      ? error.stack
      : '';

  if (stack.length === 0 || stack.includes(description)) {
    return stack || description;
  }

  return `${description}\n${stack}`;
}
