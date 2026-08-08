/**
 * Real-engine identifier-read-path benchmark for issue #40.
 *
 * Unlike `identifier-strategies-bench.js` (a synthetic micro whose short-lived
 * Reference V8 can scalar-replace), this runs the **actual** engine from
 * `src/index.js` on identifier-heavy guest programs, so it measures the
 * production read path — including the `Reference` allocation the profiling
 * evidence ranks #1 (`reference.js#getValue`). Use it to capture before/after
 * numbers around a change to the identifier read path.
 *
 * The workloads are deliberately confined to identifier reads/writes and
 * arithmetic (issue #40's lane); they avoid object, property, and array hot
 * paths, which are issue #42's territory. Each workload loops internally, so a
 * single `evaluateScript` call performs millions of identifier resolutions and
 * parsing cost is negligible.
 *
 * Run with `node --expose-gc tools/prototypes/engine-read-path-bench.js` to get
 * a meaningful peak-heap figure.
 */

import { createRealm, evaluateScript } from '../../src/index.js';

/** @typedef {{ name: string, source: string, expected: number }} ReadWorkload */

/**
 * @param {readonly string[]} lines
 * @returns {string}
 */
function source(lines) {
  return lines.join('\n');
}

/** @type {ReadonlyArray<ReadWorkload>} */
const WORKLOADS = [
  {
    // Tight loop dominated by reads/writes of function-local identifiers.
    name: 'locals-arith',
    // Pinned reference result (the mutating body makes it non-obvious by hand);
    // any deviation means the workload changed or the engine miscomputed it.
    expected: -1584266536,
    source: source([
      '(function () {',
      '  var a = 1, b = 2, c = 3, d = 4, acc = 0, i = 0;',
      '  for (i = 0; i < 300000; i += 1) {',
      '    acc = (acc + a + b + c + d) | 0;',
      '    a = (a + i) | 0;',
      '    b = (b ^ a) | 0;',
      '    c = (c + b) | 0;',
      '    d = (d + c) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
  },
  {
    // A nested function reads identifiers bound several scopes out, so every
    // read walks the environment chain — the deep-chain case cached resolution
    // and the Reference allocation both target.
    name: 'outer-scope-reads',
    // acc += (5+7+9+11) = 32 per iteration, 300000 iterations => 9600000.
    expected: 9600000,
    source: source([
      '(function () {',
      '  var base1 = 5, base2 = 7, base3 = 9, base4 = 11;',
      '  function inner() {',
      '    var acc = 0, i = 0;',
      '    for (i = 0; i < 300000; i += 1) {',
      '      acc = (acc + base1 + base2 + base3 + base4) | 0;',
      '    }',
      '    return acc | 0;',
      '  }',
      '  return inner() | 0;',
      '}())',
    ]),
  },
  {
    // Genuine global bindings (declared with top-level `var`, so they live on
    // the global environment record's object record) read from inside a nested
    // function, so each read walks out to and resolves through the global
    // record — the object-environment-record read path.
    name: 'global-reads',
    // total += (2+3+5+8) = 18 per iteration, 300000 iterations => 5400000.
    expected: 5400000,
    source: source([
      'var g1 = 2, g2 = 3, g3 = 5, g4 = 8;',
      '(function () {',
      '  var total = 0, k = 0;',
      '  for (k = 0; k < 300000; k += 1) {',
      '    total = (total + g1 + g2 + g3 + g4) | 0;',
      '  }',
      '  return total | 0;',
      '}())',
    ]),
  },
];

/**
 * @param {ReadWorkload} workload
 * @returns {number} the guest numeric result, for a checksum guard.
 */
function runOnce(workload) {
  const realm = createRealm();
  const result = evaluateScript(realm, workload.source);
  if (result.type !== 'normal') {
    throw new Error(
      `workload ${workload.name} did not complete normally: ${String(result.type)}`,
    );
  }
  return /** @type {number} */ (result.value);
}

/**
 * @returns {number} heapUsed in bytes after a best-effort collection.
 */
function heapUsedAfterGc() {
  const gc = /** @type {undefined | (() => void)} */ (
    /** @type {any} */ (globalThis).gc
  );
  if (gc) {
    gc();
    gc();
  }
  return /** @type {any} */ (process).memoryUsage().heapUsed;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * @param {ReadWorkload} workload
 * @param {number} warmups
 * @param {number} iterations
 * @returns {{ name: string, medianMs: number, peakHeapMb: number, checksum: number }}
 */
function measure(workload, warmups, iterations) {
  let checksum = 0;
  for (let i = 0; i < warmups; i += 1) checksum = runOnce(workload);

  // The pinned `expected` result guards against a silently broken workload: a
  // consistently wrong body (bad scoping, an early throw caught elsewhere, a
  // constant-folded `0`) is rejected rather than timed as if valid. Determinism
  // is enforced too, so a flaky result is also caught.
  const expected = runOnce(workload);
  if (!Number.isFinite(expected)) {
    throw new Error(
      `workload ${workload.name} produced a non-finite result: ${String(expected)}`,
    );
  }
  if (expected !== workload.expected) {
    throw new Error(
      `workload ${workload.name} produced the wrong result: ` +
        `${String(expected)} !== ${String(workload.expected)}`,
    );
  }

  const heapBefore = heapUsedAfterGc();
  let peakHeap = heapBefore;
  /** @type {number[]} */
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const startMs = performance.now();
    checksum = runOnce(workload);
    samples.push(performance.now() - startMs);
    if (checksum !== expected) {
      throw new Error(
        `workload ${workload.name} was non-deterministic: ${String(checksum)} !== ${String(expected)}`,
      );
    }
    const heapNow = /** @type {any} */ (process).memoryUsage().heapUsed;
    if (heapNow > peakHeap) peakHeap = heapNow;
  }

  return {
    name: workload.name,
    medianMs: median(samples),
    peakHeapMb: (peakHeap - heapBefore) / (1024 * 1024),
    checksum,
  };
}

function main() {
  const WARMUPS = 20;
  const ITERATIONS = 40;
  const hasGc = Boolean(/** @type {any} */ (globalThis).gc);

  process.stdout.write(
    `engine-read-path-bench: warmups=${WARMUPS} iterations=${ITERATIONS} ` +
      `expose-gc=${hasGc} node=${/** @type {any} */ (process).version}\n`,
  );
  for (const workload of WORKLOADS) {
    const result = measure(workload, WARMUPS, ITERATIONS);
    const heap = hasGc
      ? `${result.peakHeapMb.toFixed(1)} MB peak`
      : 'n/a (run with --expose-gc)';
    process.stdout.write(
      `  ${result.name.padEnd(20)} ${result.medianMs.toFixed(3).padStart(9)} ms/run  ` +
        `heap=${heap}  checksum=${result.checksum}\n`,
    );
  }
}

main();
