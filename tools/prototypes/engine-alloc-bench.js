/**
 * Real-engine identifier-read allocation benchmark for issue #40.
 *
 * The wall-clock read-path benchmark (`engine-read-path-bench.js`) cannot see
 * the `Reference` the identifier read allocates, because it is short-lived and
 * the scavenger reclaims it almost for free — so throughput barely moves. This
 * script measures the thing that *does* move: heap **allocation**. It runs each
 * workload with a loop sized to minimize garbage collection inside the measured
 * window; any window that a collection *does* touch is detected and discarded,
 * so a reported `heapUsed` delta is the bytes a GC-free run allocated rather
 * than net heap growth confounded by a collection.
 *
 * The no-GC assumption is not merely asserted — it is **verified**, and the
 * verification is careful about one subtlety: Node delivers `gc`
 * `PerformanceObserver` callbacks *asynchronously*, batched on a later timer
 * turn of the event loop (a `setImmediate` yield is not enough — the entries
 * are flushed on the timers phase), so a synchronous read taken right after the
 * workload would not yet reflect a collection that fired inside the window.
 * Instead this script records, for every observed `gc` entry, its
 * `[startTime, startTime+duration]` interval, yields through a `setTimeout(0)`
 * so those callbacks are delivered, and then discards any sample whose measured
 * `[start, end]` window overlaps a GC interval. A
 * reported delta is therefore a clean allocation figure rather than net heap
 * growth confounded by a collection. If too many samples are discarded the
 * script says so instead of reporting a misleading number.
 *
 * MUST be run with `--expose-gc`, e.g.
 * `node --expose-gc tools/prototypes/engine-alloc-bench.js`, so the pre-window
 * collection is real; without it the deltas include uncollected earlier garbage
 * and mean nothing.
 */

import { createRealm, evaluateScript } from '../../src/index.js';

/**
 * @typedef {{ name: string, source: string, expected: number }} AllocWorkload
 */

/**
 * @param {readonly string[]} lines
 * @returns {string}
 */
function source(lines) {
  return lines.join('\n');
}

/**
 * Loop counts are deliberately small (a few thousand) so the whole run's
 * allocation stays under the young-generation scavenge threshold and no GC
 * fires inside the measured window. Each workload pins the exact numeric result
 * it must produce, so a silently broken run (wrong scoping, an early throw
 * caught elsewhere, a constant-folded `0`) is rejected rather than measured.
 *
 * @type {ReadonlyArray<AllocWorkload>}
 */
const WORKLOADS = [
  {
    name: 'locals-arith',
    // acc += (1+2+3+4) = 10 per iteration, 4000 iterations => 40000.
    expected: 40000,
    source: source([
      '(function () {',
      '  var a = 1, b = 2, c = 3, d = 4, acc = 0, i = 0;',
      '  for (i = 0; i < 4000; i += 1) {',
      '    acc = (acc + a + b + c + d) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
  },
  {
    name: 'outer-scope-reads',
    // acc += (5+7+9+11) = 32 per iteration, 4000 iterations => 128000.
    expected: 128000,
    source: source([
      '(function () {',
      '  var base1 = 5, base2 = 7, base3 = 9, base4 = 11;',
      '  function inner() {',
      '    var acc = 0, i = 0;',
      '    for (i = 0; i < 4000; i += 1) {',
      '      acc = (acc + base1 + base2 + base3 + base4) | 0;',
      '    }',
      '    return acc | 0;',
      '  }',
      '  return inner() | 0;',
      '}())',
    ]),
  },
  {
    // Genuine global bindings (top-level `var`, so they live on the global
    // environment record's object record) read from inside a nested function,
    // so each read resolves through the global record — not function locals.
    name: 'global-reads',
    // total += (2+3+5+8) = 18 per iteration, 4000 iterations => 72000.
    expected: 72000,
    source: source([
      'var g1 = 2, g2 = 3, g3 = 5, g4 = 8;',
      '(function () {',
      '  var total = 0, k = 0;',
      '  for (k = 0; k < 4000; k += 1) {',
      '    total = (total + g1 + g2 + g3 + g4) | 0;',
      '  }',
      '  return total | 0;',
      '}())',
    ]),
  },
];

/**
 * Yield through a timer turn of the event loop so the runtime delivers any
 * pending `PerformanceObserver` `gc` callbacks. These are dispatched
 * asynchronously and, empirically, are flushed on the timers phase rather than
 * on the microtask/`setImmediate` (check) phase — so a `setTimeout` yield is
 * required; `setImmediate` returns before the entries arrive.
 *
 * @returns {Promise<void>}
 */
function yieldForGcEvents() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Records the `[start, end]` time interval of every GC event the runtime
 * reports, so a measured window can be checked for overlap with a collection.
 * Intervals use the same clock as `performance.now()` (both are relative to
 * `performance.timeOrigin`), so the two are directly comparable.
 */
class GcTracker {
  constructor() {
    /** @type {Array<{ start: number, end: number }>} */
    this.intervals = [];
    // `PerformanceObserver` is a cross-host global (Node exposes it globally as
    // well as via `node:perf_hooks`); reaching it through `globalThis` avoids
    // depending on the minimal ambient module types this repo ships.
    const PerformanceObserverCtor = /** @type {any} */ (globalThis)
      .PerformanceObserver;
    /** @type {any} */
    this.observer = new PerformanceObserverCtor(
      /** @param {any} list */ (list) => {
        for (const entry of list.getEntries()) {
          this.intervals.push({
            start: entry.startTime,
            end: entry.startTime + entry.duration,
          });
        }
      },
    );
    this.observer.observe({ entryTypes: ['gc'], buffered: false });
  }

  reset() {
    this.intervals = [];
  }

  /**
   * @param {number} windowStart
   * @param {number} windowEnd
   * @returns {boolean} whether any recorded GC interval overlaps the window.
   */
  overlaps(windowStart, windowEnd) {
    return this.intervals.some(
      (interval) => interval.start <= windowEnd && interval.end >= windowStart,
    );
  }

  disconnect() {
    this.observer.disconnect();
  }
}

/**
 * @param {AllocWorkload} workload
 * @param {GcTracker} tracker
 * @returns {Promise<{ bytes: number, sawGc: boolean, result: number }>}
 */
async function allocDelta(workload, tracker) {
  const proc = /** @type {any} */ (process);
  const gc = /** @type {undefined | (() => void)} */ (
    /** @type {any} */ (globalThis).gc
  );
  const realm = createRealm();
  // Prime intrinsics/JIT so only the workload's own allocation is measured.
  evaluateScript(realm, 'var warm = 1;');
  if (gc) {
    gc();
    gc();
  }
  // Flush the priming/forced-GC events out of the tracker *before* the window
  // opens, so only collections that overlap the measured window can disqualify
  // this sample.
  await yieldForGcEvents();
  tracker.reset();

  const windowStart = performance.now();
  const before = proc.memoryUsage().heapUsed;
  const completion = evaluateScript(realm, workload.source);
  const after = proc.memoryUsage().heapUsed;
  const windowEnd = performance.now();

  // Let the observer deliver any `gc` callbacks for collections that fired
  // during the window, then test for overlap.
  await yieldForGcEvents();
  const sawGc = tracker.overlaps(windowStart, windowEnd);

  if (completion.type !== 'normal') {
    throw new Error(
      `workload ${workload.name} did not complete normally: ${String(completion.type)}`,
    );
  }
  return {
    bytes: after - before,
    sawGc,
    result: /** @type {number} */ (completion.value),
  };
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

async function main() {
  const hasGc = Boolean(/** @type {any} */ (globalThis).gc);
  const SAMPLES = 40;

  process.stdout.write(
    `engine-alloc-bench: samples=${SAMPLES} expose-gc=${hasGc} ` +
      `node=${/** @type {any} */ (process).version}\n`,
  );
  if (!hasGc) {
    // Without `--expose-gc` the pre-window forced collection cannot run, so the
    // deltas would be contaminated by uncollected earlier garbage. Fail fast
    // rather than print a misleading number someone might cite.
    process.stderr.write(
      '  ERROR: re-run with --expose-gc; deltas are meaningless otherwise.\n',
    );
    /** @type {any} */ (process).exitCode = 1;
    return;
  }

  const tracker = new GcTracker();
  try {
    for (const workload of WORKLOADS) {
      /** @type {number[]} */
      const clean = [];
      let discarded = 0;
      for (let i = 0; i < SAMPLES; i += 1) {
        const sample = await allocDelta(workload, tracker);
        if (sample.result !== workload.expected) {
          throw new Error(
            `workload ${workload.name} produced the wrong result: ` +
              `${String(sample.result)} !== ${String(workload.expected)}`,
          );
        }
        if (sample.sawGc) {
          discarded += 1;
        } else {
          clean.push(sample.bytes);
        }
      }

      if (clean.length < SAMPLES / 2) {
        process.stdout.write(
          `  ${workload.name.padEnd(20)} inconclusive: ` +
            `${discarded}/${SAMPLES} samples saw GC (shrink the loop)\n`,
        );
        continue;
      }

      const kb = median(clean) / 1024;
      process.stdout.write(
        `  ${workload.name.padEnd(20)} ${kb.toFixed(1).padStart(9)} KB ` +
          `allocated / run (GC-clean samples: ${clean.length}/${SAMPLES})\n`,
      );
    }
  } finally {
    tracker.disconnect();
  }
}

main();
