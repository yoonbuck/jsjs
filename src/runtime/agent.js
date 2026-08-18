import { WELL_KNOWN_SYMBOL_NAMES, createSymbol, isSymbol } from './symbol.js';
import { AgentJobQueue } from './jobs.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./symbol.js').WellKnownSymbolName} WellKnownSymbolName
 * @typedef {{
 *   agents: Set<Agent>,
 *   resumes: number,
 *   depth: number,
 * }} GeneratorHostChain
 */

/**
 * An **agent**: the owner of the symbol state that ECMA-262 shares between
 * realms rather than within one.
 *
 * Two pieces of the Symbol design are explicitly not per-realm. §6.1.5.1 says
 * well-known symbol values "are shared by all realms", and §19.4.2.1's
 * `GlobalSymbolRegistry` is "shared by all realms" too. That is what makes
 * `@@iterator` usable as a cross-realm protocol key and `Symbol.for('x')`
 * agree between realms.
 *
 * "All realms" is bounded by the agent, not by the process, and that boundary
 * is what this class exists to make real. Holding the registry in a module
 * variable would satisfy the sharing rule and break something more important:
 * `Symbol.for` interns a **guest-controlled** string, so a module-level
 * registry accumulates guest data for the lifetime of the process, outliving
 * every realm that produced it and reachable from no handle the embedder can
 * drop. A long-running host that creates and discards realms would grow
 * without bound, and two unrelated embeddings in one process would silently
 * share a table. Making the agent an ordinary object the embedder holds means
 * the registry lives exactly as long as the agent does: drop the agent and
 * every key guest code interned in it becomes garbage.
 *
 * The well-known symbols live here for the same reason they are shared —
 * realms that must interoperate need identical protocol keys — and being
 * per-agent keeps that identity from leaking between embeddings that were
 * never meant to see each other.
 *
 * A `Realm` takes an agent (`createRealm({ agent })`) or, given none, makes
 * its own. See `docs/architecture.md` for the embedding lifecycle.
 *
 * The Agent also owns transient generator host-chain accounting. Shared-Agent
 * Realms naturally charge one chain; cross-Agent iterator delegation links the
 * participating Agents only until the outermost synchronous resume unwinds.
 * The chain retains no guest value and is cleared in `finally`.
 */
export class Agent {
  /**
   * @param {{ jobHost?: import('./jobs.js').JobHost }} [options]
   */
  constructor(options = {}) {
    /**
     * This agent's eleven well-known symbols, keyed by the name each carries
     * on the `Symbol` constructor.
     *
     * @type {Readonly<Record<WellKnownSymbolName, symbol>>}
     */
    this.wellKnownSymbols = createWellKnownSymbols();

    /**
     * ECMA-262 §19.4.2.1's `GlobalSymbolRegistry`, as the two lookups the
     * specification's [Key, Symbol] record list is ever asked for:
     * `Symbol.for` searches by key, `Symbol.keyFor` searches by symbol. Two
     * maps answer both in constant time and cannot disagree, because
     * {@link symbolFor} is the only writer and always writes both.
     *
     * @type {Map<string, symbol>}
     */
    this._registryByKey = new Map();

    /** @type {Map<symbol, string>} */
    this._registryBySymbol = new Map();

    /** @type {WeakSet<object>} */
    this._realms = new WeakSet();
    this._jobQueue = new AgentJobQueue(options.jobHost, this);
    /** @type {GeneratorHostChain | null} */
    this._generatorHostChain = null;
  }

  /**
   * How many symbols guest code has interned in this agent's registry.
   * Nothing guest-visible reads it; it exists so tests can assert that the
   * registry is owned here and grows nowhere else.
   *
   * @returns {number}
   */
  get registeredSymbolCount() {
    return this._registryByKey.size;
  }

  /**
   * ECMA-262 §19.4.2.1 `Symbol.for`: this agent's symbol for `key`, minting
   * and recording one the first time the key is seen.
   *
   * @param {string} key
   * @returns {symbol}
   */
  symbolFor(key) {
    const existing = this._registryByKey.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const symbol = createSymbol(key);

    this._registryByKey.set(key, symbol);
    this._registryBySymbol.set(symbol, key);

    return symbol;
  }

  /**
   * ECMA-262 §19.4.2.5 `Symbol.keyFor`: the key `symbol` is registered under
   * in this agent, or `undefined` for a symbol this registry has never held —
   * which includes every well-known symbol, everything `Symbol()` produced,
   * and everything another agent's registry holds.
   *
   * @param {symbol} symbol
   * @returns {string | undefined}
   */
  symbolKeyFor(symbol) {
    if (!isSymbol(symbol)) {
      throw new TypeError('symbolKeyFor requires a symbol');
    }

    return this._registryBySymbol.get(symbol);
  }

  /**
   * @param {import('./jobs.js').JobRecord} job
   */
  enqueueJob(job) {
    this._jobQueue.enqueue(job);
  }

  /**
   * @returns {import('./jobs.js').JobDrainReport}
   */
  runJobs() {
    return this._jobQueue.run();
  }

  /**
   * @returns {readonly import('./jobs.js').DurableJobFailure[]}
   */
  takeJobFailures() {
    return this._jobQueue.takeFailures();
  }

  /**
   * @param {unknown} error
   */
  recordHostHookFailure(error) {
    this._jobQueue.recordHostHookFailure(error);
  }

  /**
   * @returns {'idle' | 'scheduled' | 'draining'}
   */
  get checkpointState() {
    return this._jobQueue.state;
  }

  /**
   * @returns {import('./realm.js').Realm | null}
   */
  get currentJobRealm() {
    return this._jobQueue.currentRealm;
  }

  /**
   * @returns {import('./jobs.js').JobHost | null}
   */
  get jobHost() {
    return this._jobQueue.jobHost;
  }

  /**
   * @param {object} realm
   */
  registerRealm(realm) {
    this._realms.add(realm);
  }

  /**
   * @param {unknown} realm
   * @returns {boolean}
   */
  ownsRealm(realm) {
    return (
      typeof realm === 'object' && realm !== null && this._realms.has(realm)
    );
  }

  /**
   * Begins one synchronous generator resume on the active host chain. The first
   * resume owns the chain; nested cross-Agent resumes keep charging that owner
   * because they consume the same host stack.
   *
   * @returns {void}
   */
  enterGeneratorHostChain() {
    if (this._generatorHostChain === null) {
      this._generatorHostChain = {
        agents: new Set([this]),
        resumes: 0,
        depth: 0,
      };
    }

    this._generatorHostChain.resumes += 1;
  }

  /**
   * @returns {void}
   */
  exitGeneratorHostChain() {
    const chain = this._generatorHostChain;

    if (chain === null) {
      return;
    }

    chain.resumes -= 1;

    if (chain.resumes === 0) {
      chain.depth = 0;

      for (const agent of chain.agents) {
        if (agent._generatorHostChain === chain) {
          agent._generatorHostChain = null;
        }
      }

      chain.agents.clear();
    }
  }

  /**
   * Makes a foreign iterator Agent participate in the currently active chain.
   * The link exists only until the outermost resume unwinds.
   *
   * @param {Agent} agent
   * @returns {void}
   */
  linkGeneratorHostChain(agent) {
    const chain = this._generatorHostChain;

    if (
      chain === null ||
      agent._generatorHostChain !== null ||
      chain.agents.has(agent)
    ) {
      return;
    }

    agent._generatorHostChain = chain;
    chain.agents.add(agent);
  }

  /**
   * Charges one guarded engine frame to the complete active generator chain.
   *
   * @param {number} maxDepth
   * @returns {boolean} Whether an active generator chain was charged.
   */
  enterGeneratorHostFrame(maxDepth) {
    const chain = this._generatorHostChain;

    if (chain === null) {
      return false;
    }

    if (chain.depth >= maxDepth) {
      throw new GuestErrorSignal(
        'RangeError',
        'Maximum call stack size exceeded',
      );
    }

    chain.depth += 1;
    return true;
  }

  /**
   * @returns {void}
   */
  exitGeneratorHostFrame() {
    if (this._generatorHostChain !== null) {
      this._generatorHostChain.depth -= 1;
    }
  }
}

/**
 * Mints one agent's worth of well-known symbols. Each is a fresh value with
 * the `[[Description]]` §6.1.5.1's table specifies, so
 * `String(Symbol.iterator)` is `"Symbol(Symbol.iterator)"` in every agent
 * while no two agents share the value.
 *
 * @returns {Readonly<Record<WellKnownSymbolName, symbol>>}
 */
export function createWellKnownSymbols() {
  return Object.freeze(
    /** @type {Record<WellKnownSymbolName, symbol>} */ (
      Object.fromEntries(
        WELL_KNOWN_SYMBOL_NAMES.map((name) => [
          name,
          createSymbol(`Symbol.${name}`),
        ]),
      )
    ),
  );
}

/**
 * @param {{ jobHost?: import('./jobs.js').JobHost }} [options]
 * @returns {Agent}
 */
export function createAgent(options = {}) {
  return new Agent(options);
}
