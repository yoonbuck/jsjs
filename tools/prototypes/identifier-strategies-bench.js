/**
 * Isolated identifier-resolution strategy micro-benchmark for issue #40.
 *
 * This does NOT touch the engine. It models the one decision the engine makes
 * on every identifier read — walk the environment chain and produce the bound
 * value — under three strategies, so the ADR can quote a throughput and an
 * allocation ceiling for each without merging any of them into `src/`:
 *
 *   1. `reference`  — resolve to a heap-allocated Reference record, then read
 *      through a separate, polymorphic `getValueLike` dispatcher. This mirrors
 *      the current engine path (`getIdentifierReference` allocates a
 *      `Reference`; the exported `getValue` dereferences it), which the
 *      profiling evidence ranks #1 for allocation (`reference.js#getValue`).
 *   2. `fused`      — walk the chain and return the bound value directly, with
 *      no per-read allocation. This is the low-risk, semantics-identical
 *      change the ADR proposes for the read path.
 *   3. `slotCache`  — an *idealized* scope-depth hit path: the resolver is
 *      handed the depth the binding lives at, so it skips the `hasBinding`
 *      search and reads the slot directly. This is the ceiling of "cached
 *      environment resolution" only — it models neither the cache lookup, the
 *      validity guard, a miss, nor any invalidation bookkeeping a real cache
 *      would need (see the ADR's invalidation section). Read it as an
 *      upper-bound "if resolution were free", not an achievable cache.
 *
 * IMPORTANT — why `getValueLike` is a separate, polymorphic function: in naive
 * monomorphic isolation V8 escape-analyzes the short-lived Reference away, so
 * allocation reads as zero and the numbers mislead. The real engine defeats
 * that because `getValue` is an exported function that branches over several
 * base shapes (environment record, primitive wrapper, property-reference base),
 * so the Reference genuinely escapes and is heap-allocated. This benchmark
 * reproduces that by dispatching through a polymorphic `getValueLike` over
 * several distinct base classes, matching the profiled reality.
 *
 * Run with `node --expose-gc` to get real per-lookup heap-allocation numbers.
 */

/**
 * @typedef {{
 *   outer: BaseRecord | null,
 *   hasBinding: (name: string) => boolean,
 *   getBindingValue: (name: string) => number,
 * }} BaseRecord
 */

/**
 * Three distinct record classes with identical shape but different hidden
 * classes, so a dispatcher that inspects them stays polymorphic — exactly the
 * condition that stops V8 from scalar-replacing the Reference.
 */
class DeclarativeRecord {
  /** @param {BaseRecord | null} outer */
  constructor(outer) {
    /** @type {BaseRecord | null} */
    this.outer = outer;
    /** @type {Map<string, number>} */
    this.bindings = new Map();
  }
  /** @param {string} name @returns {boolean} */
  hasBinding(name) {
    return this.bindings.has(name);
  }
  /** @param {string} name @returns {number} */
  getBindingValue(name) {
    return /** @type {number} */ (this.bindings.get(name));
  }
}

class GlobalRecord {
  /** @param {BaseRecord | null} outer */
  constructor(outer) {
    /** @type {BaseRecord | null} */
    this.outer = outer;
    /** @type {Map<string, number>} */
    this.bindings = new Map();
  }
  /** @param {string} name @returns {boolean} */
  hasBinding(name) {
    return this.bindings.has(name);
  }
  /** @param {string} name @returns {number} */
  getBindingValue(name) {
    return /** @type {number} */ (this.bindings.get(name));
  }
}

class ObjectRecord {
  /** @param {BaseRecord | null} outer */
  constructor(outer) {
    /** @type {BaseRecord | null} */
    this.outer = outer;
    /** @type {Map<string, number>} */
    this.bindings = new Map();
  }
  /** @param {string} name @returns {boolean} */
  hasBinding(name) {
    return this.bindings.has(name);
  }
  /** @param {string} name @returns {number} */
  getBindingValue(name) {
    return /** @type {number} */ (this.bindings.get(name));
  }
}

/**
 * A Reference record allocated per read, matching the engine's shape (base
 * record + name + strict flag).
 */
class Reference {
  /**
   * @param {BaseRecord} base
   * @param {string} name
   * @param {boolean} strict
   */
  constructor(base, name, strict) {
    this.base = base;
    this.referencedName = name;
    this.strict = strict;
  }
}

/**
 * Mirrors the engine's exported `getValue`: a separate function that branches
 * over base shape. The method-presence check matches `reference.js` and keeps
 * the call polymorphic so the Reference escapes.
 *
 * @param {Reference} reference
 * @returns {number}
 */
function getValueLike(reference) {
  const base = reference.base;
  if (base === null || base === undefined) {
    throw new ReferenceError(`${reference.referencedName} is not defined`);
  }
  if (typeof base.getBindingValue === 'function') {
    return base.getBindingValue(reference.referencedName);
  }
  throw new TypeError('Unsupported reference base');
}

/**
 * Strategy 1: allocate a Reference for the resolved record, then read it
 * through the polymorphic dispatcher.
 *
 * @param {BaseRecord | null} env
 * @param {string} name
 * @returns {number}
 */
function readViaReference(env, name) {
  /** @type {BaseRecord | null} */
  let current = env;
  while (current !== null) {
    if (current.hasBinding(name)) {
      return getValueLike(new Reference(current, name, false));
    }
    current = current.outer;
  }
  throw new ReferenceError(`${name} is not defined`);
}

/**
 * Strategy 2: walk the chain and return the value directly, no allocation.
 *
 * @param {BaseRecord | null} env
 * @param {string} name
 * @returns {number}
 */
function readFused(env, name) {
  /** @type {BaseRecord | null} */
  let current = env;
  while (current !== null) {
    if (current.hasBinding(name)) {
      return current.getBindingValue(name);
    }
    current = current.outer;
  }
  throw new ReferenceError(`${name} is not defined`);
}

/**
 * Strategy 3: an *idealized* scope-depth hit path — jump `depth` records up and
 * read the slot without searching. This is deliberately the ceiling: it is
 * handed the correct depth and models neither the cache lookup, the validity
 * guard, a miss, nor any invalidation cost. It still calls `getBindingValue`,
 * so it models cached *depth*, not a raw slot. Treat its result as an
 * upper-bound "if resolution were free" figure, not as an achievable cache.
 *
 * @param {BaseRecord | null} env
 * @param {string} name
 * @param {number} depth
 * @returns {number}
 */
function readViaSlotCache(env, name, depth) {
  /** @type {BaseRecord | null} */
  let current = env;
  for (let level = 0; level < depth; level += 1) {
    current = /** @type {BaseRecord} */ (current).outer;
  }
  return /** @type {BaseRecord} */ (current).getBindingValue(name);
}

/**
 * Builds a scope chain of `chainDepth` records whose outermost record is
 * `RootClass` and holds `name`. Every lookup traverses the whole chain — the
 * worst case that dominates loop-heavy guest code reading outer-scope `var`s.
 *
 * @param {number} chainDepth
 * @param {string} name
 * @param {new (outer: BaseRecord | null) => BaseRecord} RootClass
 * @returns {{ leaf: BaseRecord, depth: number }}
 */
function buildChain(chainDepth, name, RootClass) {
  /** @type {BaseRecord} */
  let scope = new RootClass(null);
  /** @type {any} */ (scope).bindings.set(name, 42);
  for (let level = 1; level < chainDepth; level += 1) {
    const inner = new DeclarativeRecord(scope);
    inner.bindings.set(`local${level}`, level);
    scope = inner;
  }
  return { leaf: scope, depth: chainDepth - 1 };
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
 * Times a strategy across `iterations` lookups and reports throughput plus the
 * heap growth attributable to the run. `chains` is cycled so the resolved base
 * stays polymorphic across the three record classes.
 *
 * @param {string} label
 * @param {(leaf: BaseRecord, depth: number) => number} lookup
 * @param {ReadonlyArray<{ leaf: BaseRecord, depth: number }>} chains
 * @param {number} iterations
 * @returns {{
 *   label: string,
 *   opsPerSec: number,
 *   bytesPerMLookups: number,
 *   checksum: number,
 * }}
 */
function measure(label, lookup, chains, iterations) {
  const count = chains.length;
  // Warm up so the JIT compiles the hot path before measurement.
  let warm = 0;
  for (let i = 0; i < 200000; i += 1) {
    const chain = chains[i % count];
    warm += lookup(chain.leaf, chain.depth);
  }
  void warm;

  const heapBefore = heapUsedAfterGc();
  const startMs = performance.now();
  let checksum = 0;
  for (let i = 0; i < iterations; i += 1) {
    const chain = chains[i % count];
    checksum += lookup(chain.leaf, chain.depth);
  }
  const elapsedMs = performance.now() - startMs;
  const heapAfter = /** @type {any} */ (process).memoryUsage().heapUsed;

  const opsPerSec = (iterations / elapsedMs) * 1000;
  const bytesPerMLookups = ((heapAfter - heapBefore) / iterations) * 1e6;
  return { label, opsPerSec, bytesPerMLookups, checksum };
}

function main() {
  const NAME = 'target';
  const CHAIN_DEPTH = 6;
  const ITERATIONS = 5000000;
  const chains = [
    buildChain(CHAIN_DEPTH, NAME, DeclarativeRecord),
    buildChain(CHAIN_DEPTH, NAME, GlobalRecord),
    buildChain(CHAIN_DEPTH, NAME, ObjectRecord),
  ];

  const results = [
    measure(
      'reference (current)',
      (leaf) => readViaReference(leaf, NAME),
      chains,
      ITERATIONS,
    ),
    measure(
      'fused (no alloc)',
      (leaf) => readFused(leaf, NAME),
      chains,
      ITERATIONS,
    ),
    measure(
      'slotCache (ceiling)',
      (leaf, depth) => readViaSlotCache(leaf, NAME, depth),
      chains,
      ITERATIONS,
    ),
  ];

  const baseline = results[0].opsPerSec;
  const hasGc = Boolean(/** @type {any} */ (globalThis).gc);

  process.stdout.write(
    `identifier-strategies-bench: chainDepth=${CHAIN_DEPTH} ` +
      `iterations=${ITERATIONS} polymorphic-base=3 expose-gc=${hasGc}\n`,
  );
  for (const result of results) {
    const speedup = (result.opsPerSec / baseline).toFixed(2);
    const mops = (result.opsPerSec / 1e6).toFixed(2);
    const alloc = hasGc
      ? `${(result.bytesPerMLookups / 1e6).toFixed(1)} MB/Mlookups`
      : 'n/a (run with --expose-gc)';
    process.stdout.write(
      `  ${result.label.padEnd(22)} ${mops.padStart(8)} Mops/s  ` +
        `${speedup.padStart(5)}x  alloc=${alloc}\n`,
    );
  }
}

main();
