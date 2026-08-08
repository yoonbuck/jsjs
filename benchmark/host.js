import { createRealm, evaluateScript } from '../src/index.js';

export const runtimeEngine = Object.freeze({
  createRealm,
  evaluateScript,
});

/**
 * @param {() => number} readNow
 * @returns {() => number}
 */
export function monotonicNowFrom(readNow) {
  let lastNow = Number.NEGATIVE_INFINITY;

  return () => {
    const nextNow = readNow();

    if (!Number.isFinite(nextNow)) {
      return nextNow;
    }

    if (nextNow <= lastNow) {
      // A stalled coarse clock only gets nudged to a positive delta here; the
      // resulting epsilon-sized elapsed time is not a measurable benchmark
      // sample, so calibration must grow probes until it clears clock granularity.
      lastNow += Math.max(1, Math.abs(lastNow)) * Number.EPSILON;
      return lastNow;
    }

    lastNow = nextNow;
    return nextNow;
  };
}
