import { GuestErrorSignal } from './completion.js';

/**
 * The number of engine stack frames a realm may use for guest work by default.
 *
 * The engine evaluates guest code by recursing on the host's own stack, so
 * without a budget of its own it inherits the host's: unbounded guest
 * recursion exhausts the host stack and raises a host `RangeError` that no
 * guest `try`/`catch` can see, at a depth that differs between Node, Chromium,
 * and `jsc`. This constant replaces that with a boundary the engine owns — one
 * that trips at the same point on every host, before any of them runs out of
 * stack.
 *
 * The unit is an *engine frame*, not a guest call, because a guest call is not
 * a fixed amount of host stack: the evaluator walks expressions and statements
 * recursively, so the same call costs more the deeper it sits in an expression
 * (`f()` versus `(1 + (2 + (3 + f())))`). Counting the frames the engine
 * actually pushes is what makes one budget safe for every shape — including
 * shapes written to spend host stack, which is what untrusted guest source
 * will do.
 *
 * The value is set from measurement, not taste. For each of the engine's
 * stack-hungriest shapes — a call nested twenty levels deep in an expression,
 * a recursion threaded through `eval`, a built-in callback, a `valueOf`, a
 * `sort` comparator, an accessor, `String()` on a self-nesting array,
 * `JSON.parse`/`JSON.stringify` on data nested to the same degree, a regular
 * expression whose pattern nests to the same degree — the largest budget that
 * still trips before the host stack does is:
 *
 * | host          | worst shape             | largest safe budget |
 * | ------------- | ----------------------- | ------------------- |
 * | Node 26       | `String(nested array)`  |                1091 |
 * | Chromium (V8) | `String(nested array)`  |                1086 |
 * | `jsc`         | deeply alternated regex |                6143 |
 *
 * 500 keeps better than a factor of two in reserve against the smallest of
 * those, which is what pays for the host frames an *embedder* has already
 * spent before it calls into the engine. It buys about 165 activations of a
 * plain recursion, 246 levels of `String()` on a self-nesting array, and 493
 * levels of `JSON.stringify` — shallower than a host engine allows, and the
 * honest cost of a boundary that holds for the worst shape rather than the
 * average one. An embedder that knows its host and its own stack can raise it
 * per realm with `createRealm({ maxStackDepth })`.
 */
export const DEFAULT_MAX_STACK_DEPTH = 500;

/**
 * Counts the engine frames one realm currently has on the host stack and turns
 * the moment the count would exceed `maxDepth` into a guest-visible error.
 * During a synchronous generator resume, the first Agent also owns a temporary
 * complete host-chain count: every guarded frame entered until the outermost
 * resume unwinds charges that count, including frames in another Realm or Agent.
 * A merged chain retains the smallest `maxDepth` observed from its participating
 * Realms, so adding a Realm can only tighten the complete host-chain budget;
 * each Realm's ordinary evaluator count and configured limit remain unchanged.
 *
 * Three kinds of work enter the guard, because all three recurse on the host
 * stack proportionally to something guest source controls:
 *
 * - every activation — guest functions, guest constructors, and built-ins
 *   alike, so a recursion threaded through `[].map`, a getter, a `valueOf`, or
 *   an `eval` chain is counted in the same units as a direct call;
 * - every expression and statement the evaluator walks into, so a call buried
 *   in a deeply nested expression costs what it really costs;
 * - every active generator resumption, because synchronous `yield*` and
 *   generator-backed iteration can resume another generator before the current
 *   continuation unwinds;
 * - `JSON.parse` and `JSON.stringify`, whose recursion follows the shape of
 *   runtime *data* rather than of source, and the regular-expression pattern
 *   parser, whose recursion follows the shape of a guest-supplied pattern
 *   string.
 *
 * Exceeding the budget raises a `GuestErrorSignal` for a `RangeError`, which
 * the nearest realm-aware boundary (`callFunction`, `evaluateTryStatement`'s
 * `runToCompletion`, or `evaluateScript`) materialises into that realm's own
 * `RangeError`. Nothing else is caught or reinterpreted: a host exception
 * raised by an engine defect still escapes as itself.
 *
 * The ordinary count remains per Realm. The generator host-chain count exists
 * only while synchronous resumes are nested, because those resumes can cross
 * Realm and Agent boundaries without unwinding the shared host stack. Both
 * counts return to zero through `finally`; sequential work in any Realm or Agent
 * receives its full configured budget.
 *
 * Every `enter` is paired with an `exit` through a `try`/`finally`, so the
 * count is exact whether a frame returns or throws, and no boundary has to
 * repair it after catching a signal. Guarding a frame costs a counter bump and
 * a `finally`, which measured against the engine's own suite and against a
 * loop-and-recursion benchmark is inside the run-to-run noise.
 */
export class StackGuard {
  /**
   * @param {number} [maxDepth=DEFAULT_MAX_STACK_DEPTH]
   * @param {import('./agent.js').Agent} [agent]
   */
  constructor(maxDepth = DEFAULT_MAX_STACK_DEPTH, agent) {
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new TypeError(
        `maxStackDepth must be a positive integer, received ${String(maxDepth)}`,
      );
    }

    /** @type {number} */
    this.maxDepth = maxDepth;
    /** @type {number} */
    this.depth = 0;
    this.agent = agent;
    this.generatorHostChainDepth = 0;
    /** @type {import('./agent.js').GeneratorHostChain[]} */
    this._generatorHostChainFrames = [];
  }

  /**
   * Records the entry of one engine frame.
   *
   * The failing frame is *not* counted: `enter` throws before incrementing, so
   * a caller that pairs `enter` with `exit` in a `finally` must place the
   * `enter` outside the `try`.
   *
   * @returns {void}
   */
  enter() {
    if (this.depth >= this.maxDepth) {
      throw new GuestErrorSignal(
        'RangeError',
        'Maximum call stack size exceeded',
      );
    }

    const chargedGeneratorHostChain =
      this.agent?.enterGeneratorHostFrame(this.maxDepth) ?? null;

    this.depth += 1;

    if (chargedGeneratorHostChain !== null) {
      this._generatorHostChainFrames.push(chargedGeneratorHostChain);
      this.generatorHostChainDepth += 1;
    }
  }

  /**
   * @returns {void}
   */
  exit() {
    this.depth -= 1;

    if (this.generatorHostChainDepth > 0) {
      const chargedGeneratorHostChain = this._generatorHostChainFrames.pop();

      if (chargedGeneratorHostChain === undefined) {
        throw new TypeError('Generator host-chain frame stack is empty');
      }

      this.generatorHostChainDepth -= 1;
      this.agent?.exitGeneratorHostFrame(chargedGeneratorHostChain);
    }
  }
}
