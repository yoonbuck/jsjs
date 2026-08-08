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
      lastNow += Math.max(1, Math.abs(lastNow)) * Number.EPSILON;
      return lastNow;
    }

    lastNow = nextNow;
    return nextNow;
  };
}
