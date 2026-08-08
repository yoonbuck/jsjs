import { monotonicNowFrom, runtimeEngine } from '../host.js';
import { createProfileTarget } from './target.js';

const PROFILE_TARGET_STATE_KEY = '__jsjsProfileTargetState';

/**
 * @typedef {{ target: ReturnType<typeof createProfileTarget> }} BrowserProfileTargetState
 */

/**
 * @param {{
 *   workload: { name?: string, source: string, expectedChecksum: number },
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 * }} options
 * @returns {{ expectedChecksum: number }}
 */
export function prepareBrowserProfilePage({
  workload,
  mode,
  warmups,
  iterations,
}) {
  const stateHolder = browserProfileStateHolder();
  const target = createBrowserProfileTarget({
    workload,
    mode,
    warmups,
    iterations,
  });

  target.runWarmups();
  stateHolder[PROFILE_TARGET_STATE_KEY] = Object.freeze({
    target,
  });

  return Object.freeze({
    expectedChecksum: target.expectedChecksum,
  });
}

/**
 * @param {{
 *   workload: { name?: string, source: string, expectedChecksum: number },
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 * }} options
 * @returns {{
 *   runtimeVersion: string,
 *   expectedChecksum: number,
 *   elapsedMilliseconds: number,
 *   result: { iterations: number, checksum: number },
 * }}
 */
export function runBrowserProfilePage({ workload, mode, warmups, iterations }) {
  void workload;
  void mode;
  void warmups;
  void iterations;
  const now = browserProfileNow();
  const stateHolder = browserProfileStateHolder();
  const state = stateHolder[PROFILE_TARGET_STATE_KEY];
  const target = state?.target;

  if (target === undefined) {
    throw new Error(
      'Browser profile target was not prepared before measurement',
    );
  }

  const startedAt = now();
  try {
    const result = target.runMeasured();
    const finishedAt = now();

    return Object.freeze({
      runtimeVersion: globalThis.navigator?.userAgent ?? 'chromium',
      expectedChecksum: target.expectedChecksum,
      elapsedMilliseconds: finishedAt - startedAt,
      result,
    });
  } finally {
    delete stateHolder[PROFILE_TARGET_STATE_KEY];
  }
}

/**
 * @param {{
 *   workload: { name?: string, source: string, expectedChecksum: number },
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 * }} options
 * @returns {ReturnType<typeof createProfileTarget>}
 */
function createBrowserProfileTarget({ workload, mode, warmups, iterations }) {
  return createProfileTarget({
    workload,
    mode,
    warmups,
    iterations,
    now: browserProfileNow(),
    engine: runtimeEngine,
  });
}

/**
 * @returns {() => number}
 */
function browserProfileNow() {
  const rawNow =
    typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now.bind(globalThis.performance)
      : Date.now;

  return monotonicNowFrom(rawNow);
}

/**
 * @returns {typeof globalThis & { __jsjsProfileTargetState?: BrowserProfileTargetState }}
 */
function browserProfileStateHolder() {
  return /** @type {typeof globalThis & { __jsjsProfileTargetState?: BrowserProfileTargetState }} */ (
    globalThis
  );
}
