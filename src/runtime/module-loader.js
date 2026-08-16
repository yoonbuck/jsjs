import { parseModule } from '../parser.js';
import { evaluateModuleGraph } from '../evaluator/modules.js';
import { ThrowSignal } from './completion.js';
import { linkModuleGraph } from './module-linker.js';
import { ModuleLoaderError, SourceTextModuleRecord } from './module-record.js';
import { isRealm } from './realm.js';

/**
 * @typedef {{
 *   resolve: (
 *     specifier: string,
 *     referrer: string | null,
 *   ) => string | PromiseLike<string>,
 *   load: (
 *     identifier: string,
 *   ) => string | { sourceText: string } | PromiseLike<string | { sourceText: string }>,
 * }} ModuleHost
 */

/**
 * @typedef {{
 *   specifier: string,
 *   identifier: string,
 *   module: SourceTextModuleRecord,
 * }} ResolvedModuleRequest
 */

/**
 * @typedef {{
 *   receiver: any,
 *   resolve: (
 *     specifier: string,
 *     referrer: string | null,
 *   ) => string | PromiseLike<string>,
 *   load: (
 *     identifier: string,
 *   ) => string | { sourceText: string } | PromiseLike<string | { sourceText: string }>,
 * }} ModuleHostBindings
 */

/**
 * @typedef {ModuleHostBindings & {
 *   realm: import('./realm.js').Realm,
 * }} ModuleLoaderBindings
 */

/**
 * @typedef {{
 *   bindings: ModuleLoaderBindings,
 *   records: Map<string, SourceTextModuleRecord>,
 *   resolveInFlight: Map<string, Map<string | null, Promise<string>>>,
 *   loadInFlight: Map<string, Promise<SourceTextModuleRecord>>,
 *   graphInFlight: Map<string, Promise<SourceTextModuleRecord>>,
 *   requestInFlight: Map<string, Promise<SourceTextModuleRecord>>,
 *   requestFailures: Map<string, { error: unknown, throughSequence: number }>,
 *   loadedRequests: Set<string>,
 *   completedGraphs: Set<string>,
 *   nextGraphSequence: number,
 *   activeLoadIdentifiers: Set<string>,
 *   evaluationInFlight: WeakMap<SourceTextModuleRecord, Promise<any>>,
 *   evaluationErrors: WeakMap<SourceTextModuleRecord, ModuleLoaderError>,
 * }} ModuleLoaderState
 */

/** @type {WeakMap<ModuleLoader, ModuleLoaderState>} */
const MODULE_LOADER_STATE = new WeakMap();

/**
 * Constructs a module loader bound to one Realm.
 *
 * @param {import('./realm.js').Realm} realm
 * @param {ModuleHost} host
 * @returns {ModuleLoader}
 */
export function createModuleLoader(realm, host) {
  return new ModuleLoader(realm, host);
}

/**
 * The portable module host boundary and its Realm-owned module cache.
 */
export class ModuleLoader {
  /**
   * @param {import('./realm.js').Realm} realm
   * @param {ModuleHost} host
   */
  constructor(realm, host) {
    if (!isRealm(realm)) {
      throw new TypeError('Expected realm to be a Realm');
    }
    MODULE_LOADER_STATE.set(this, {
      bindings: Object.freeze({ realm, ...validateModuleHost(host) }),
      records: new Map(),
      resolveInFlight: new Map(),
      loadInFlight: new Map(),
      graphInFlight: new Map(),
      requestInFlight: new Map(),
      requestFailures: new Map(),
      loadedRequests: new Set(),
      completedGraphs: new Set(),
      nextGraphSequence: 0,
      activeLoadIdentifiers: new Set(),
      evaluationInFlight: new WeakMap(),
      evaluationErrors: new WeakMap(),
    });
  }

  /**
   * Acquires, links, and evaluates the source graph, then returns its cached
   * module namespace.
   *
   * @param {string} specifier
   * @param {string | null} [referrer=null]
   * @returns {Promise<any>}
   */
  async loadAndEvaluate(specifier, referrer = null) {
    const record = await loadModuleGraph(this, specifier, referrer);
    const state = moduleLoaderState(this);
    const inFlight = state.evaluationInFlight.get(record);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const evaluation = Promise.resolve().then(() => {
      linkModuleGraph(record);
      try {
        evaluateModuleGraph(record);
      } catch (error) {
        if (
          error instanceof ThrowSignal &&
          record.evaluationCompletion?.type === 'throw'
        ) {
          throw cachedEvaluationError(this, record);
        }

        throw asModuleLoaderError('evaluate', record.identifier, error);
      }
      return record.getNamespace();
    });
    state.evaluationInFlight.set(record, evaluation);

    try {
      return await evaluation;
    } finally {
      if (state.evaluationInFlight.get(record) === evaluation) {
        state.evaluationInFlight.delete(record);
      }
    }
  }
}

/**
 * @param {ModuleLoader} loader
 * @param {SourceTextModuleRecord} record
 * @returns {ModuleLoaderError}
 */
function cachedEvaluationError(loader, record) {
  const errors = moduleLoaderState(loader).evaluationErrors;
  const cached = errors.get(record);

  if (cached !== undefined) {
    return cached;
  }

  const completion = record.evaluationCompletion;
  if (completion?.type !== 'throw') {
    throw new TypeError('Evaluation failure is missing an abrupt completion');
  }

  const error = new ModuleLoaderError({
    phase: 'evaluate',
    identifier: record.identifier,
    value: completion.value,
  });
  errors.set(record, error);
  return error;
}

/**
 * Acquires one parsed Module Record and every requested dependency. This is
 * intentionally internal: public callers use ModuleLoader#loadAndEvaluate.
 *
 * @param {ModuleLoader} loader
 * @param {string} specifier
 * @param {string | null} [referrer=null]
 * @returns {Promise<SourceTextModuleRecord>}
 */
export async function loadModuleGraph(loader, specifier, referrer = null) {
  if (!(loader instanceof ModuleLoader)) {
    throw new TypeError('Expected loader to be a ModuleLoader');
  }
  validateRequest(specifier, referrer);
  // This snapshot is limited to host.load's synchronous invocation; after its
  // thenable is returned, same-identifier requests use normal in-flight deduplication.
  const activeLoadIdentifier = currentActiveLoadIdentifier(loader);

  const identifier = await resolveModule(loader, specifier, referrer);

  if (activeLoadIdentifier === identifier) {
    throw new ModuleLoaderError({
      phase: 'load',
      identifier,
      cause: new Error('Module load hook reentered its active identifier'),
    });
  }

  return acquireModuleGraph(loader, identifier);
}

/**
 * @param {ModuleLoader} loader
 * @param {string} specifier
 * @param {string | null} referrer
 * @returns {Promise<string>}
 */
function resolveModule(loader, specifier, referrer) {
  const bindings = moduleLoaderBindings(loader);
  const state = moduleLoaderState(loader);
  let byReferrer = state.resolveInFlight.get(specifier);
  if (byReferrer === undefined) {
    byReferrer = new Map();
    state.resolveInFlight.set(specifier, byReferrer);
  }

  const pending = byReferrer.get(referrer);
  if (pending !== undefined) {
    return pending;
  }

  const resolution = Promise.resolve()
    .then(() => bindings.resolve.call(bindings.receiver, specifier, referrer))
    .then((identifier) => {
      if (typeof identifier !== 'string' || identifier.length === 0) {
        throw new TypeError(
          'Module host resolve must return a non-empty string',
        );
      }
      return identifier;
    })
    .catch((error) => {
      throw asModuleLoaderError('resolve', undefined, error);
    })
    .finally(() => {
      byReferrer.delete(referrer);
      if (byReferrer.size === 0) {
        state.resolveInFlight.delete(specifier);
      }
    });

  byReferrer.set(referrer, resolution);
  return resolution;
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {Promise<SourceTextModuleRecord>}
 */
function acquireModuleGraph(loader, identifier) {
  const state = moduleLoaderState(loader);
  const cached = state.records.get(identifier);
  if (state.completedGraphs.has(identifier) && cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = state.graphInFlight.get(identifier);
  if (pending !== undefined) {
    return pending;
  }

  const sequence = ++state.nextGraphSequence;
  const discovered = new Set();
  const graph = discoverModuleGraph(loader, identifier, discovered, sequence)
    .then((record) => {
      for (const discoveredIdentifier of discovered) {
        state.completedGraphs.add(discoveredIdentifier);
      }
      return record;
    })
    .finally(() => {
      if (state.graphInFlight.get(identifier) === graph) {
        state.graphInFlight.delete(identifier);
      }
    });

  state.graphInFlight.set(identifier, graph);
  return graph;
}

/**
 * Traverses only loader-owned request records. A traversal never awaits another
 * root's graph Promise, so overlapping roots cannot form a Promise dependency
 * cycle; per-record request acquisition remains shared and source ordered.
 *
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @param {Set<string>} discovered
 * @param {number} sequence
 * @returns {Promise<SourceTextModuleRecord>}
 */
async function discoverModuleGraph(loader, identifier, discovered, sequence) {
  const state = moduleLoaderState(loader);
  const cached = state.records.get(identifier);
  if (state.completedGraphs.has(identifier) && cached !== undefined) {
    return cached;
  }
  if (discovered.has(identifier)) {
    return acquireSourceRecord(loader, identifier);
  }

  discovered.add(identifier);
  const record = await acquireModuleRequests(loader, identifier, sequence);
  for (const request of record.resolvedRequestedModules) {
    await discoverModuleGraph(loader, request.identifier, discovered, sequence);
  }
  return record;
}

/**
 * Resolves and acquires the parsed records for one module's direct requests.
 * The complete immutable edge list is published atomically.
 *
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @param {number} sequence
 * @returns {Promise<SourceTextModuleRecord>}
 */
function acquireModuleRequests(loader, identifier, sequence) {
  const state = moduleLoaderState(loader);
  const cached = state.records.get(identifier);
  if (state.loadedRequests.has(identifier) && cached !== undefined) {
    return Promise.resolve(cached);
  }

  const failure = state.requestFailures.get(identifier);
  if (failure !== undefined) {
    if (sequence <= failure.throughSequence) {
      return Promise.reject(failure.error);
    }
    state.requestFailures.delete(identifier);
  }

  const pending = state.requestInFlight.get(identifier);
  if (pending !== undefined) {
    return pending;
  }

  const requests = acquireSourceRecord(loader, identifier)
    .then(async (record) => {
      /** @type {ResolvedModuleRequest[]} */
      const resolvedRequests = [];

      for (const specifier of record.requestedModules) {
        const childIdentifier = await resolveModule(
          loader,
          specifier,
          identifier,
        );
        const child = await acquireSourceRecord(loader, childIdentifier);
        resolvedRequests.push(
          Object.freeze({
            specifier,
            identifier: childIdentifier,
            module: child,
          }),
        );
      }

      record.resolvedRequestedModules = Object.freeze(resolvedRequests);
      state.requestFailures.delete(identifier);
      state.loadedRequests.add(identifier);
      return record;
    })
    .catch((error) => {
      state.requestFailures.set(identifier, {
        error,
        throughSequence: state.nextGraphSequence,
      });
      throw error;
    })
    .finally(() => {
      if (state.requestInFlight.get(identifier) === requests) {
        state.requestInFlight.delete(identifier);
      }
    });

  state.requestInFlight.set(identifier, requests);
  return requests;
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {Promise<SourceTextModuleRecord>}
 */
function acquireSourceRecord(loader, identifier) {
  const bindings = moduleLoaderBindings(loader);
  const state = moduleLoaderState(loader);
  const cached = state.records.get(identifier);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  if (state.activeLoadIdentifiers.has(identifier)) {
    return Promise.reject(
      new ModuleLoaderError({
        phase: 'load',
        identifier,
        cause: new Error('Module load hook reentered its active identifier'),
      }),
    );
  }

  const pending = state.loadInFlight.get(identifier);
  if (pending !== undefined) {
    return pending;
  }

  const source = Promise.resolve()
    .then(async () => {
      let result;
      state.activeLoadIdentifiers.add(identifier);
      try {
        result = bindings.load.call(bindings.receiver, identifier);
      } catch (error) {
        throw asModuleLoaderError('load', identifier, error);
      } finally {
        state.activeLoadIdentifiers.delete(identifier);
      }

      try {
        result = await result;
        const sourceText = validateModuleSource(result);
        let ast;

        try {
          ast = parseModule(sourceText);
        } catch (error) {
          throw asModuleLoaderError('parse', identifier, error);
        }

        const record = new SourceTextModuleRecord({
          realm: bindings.realm,
          identifier,
          ast,
        });
        state.records.set(identifier, record);
        return record;
      } catch (error) {
        throw asModuleLoaderError('load', identifier, error);
      }
    })
    .finally(() => {
      state.loadInFlight.delete(identifier);
    });

  state.loadInFlight.set(identifier, source);
  return source;
}

/**
 * @param {unknown} host
 * @returns {ModuleHostBindings}
 */
function validateModuleHost(host) {
  if (
    host === null ||
    (typeof host !== 'object' && typeof host !== 'function')
  ) {
    throw new TypeError('Expected module host object');
  }

  const candidate = /** @type {{ resolve?: unknown, load?: unknown }} */ (host);
  const { resolve, load } = candidate;
  if (typeof resolve !== 'function' || typeof load !== 'function') {
    throw new TypeError('Expected module host resolve and load functions');
  }

  return Object.freeze({
    receiver: host,
    resolve: /** @type {ModuleHostBindings['resolve']} */ (resolve),
    load: /** @type {ModuleHostBindings['load']} */ (load),
  });
}

/**
 * @param {ModuleLoader} loader
 * @returns {ModuleLoaderState}
 */
function moduleLoaderState(loader) {
  const state = MODULE_LOADER_STATE.get(loader);
  if (state === undefined) {
    throw new TypeError('Expected loader to be a ModuleLoader');
  }
  return state;
}

/**
 * @param {ModuleLoader} loader
 * @returns {ModuleLoaderBindings}
 */
function moduleLoaderBindings(loader) {
  return moduleLoaderState(loader).bindings;
}

/**
 * @param {string} specifier
 * @param {string | null} referrer
 * @returns {void}
 */
function validateRequest(specifier, referrer) {
  if (typeof specifier !== 'string') {
    throw new TypeError('Expected module specifier string');
  }
  if (referrer !== null && typeof referrer !== 'string') {
    throw new TypeError('Expected module referrer string or null');
  }
}

/**
 * @param {unknown} result
 * @returns {string}
 */
function validateModuleSource(result) {
  if (typeof result === 'string') {
    return result;
  }
  if (result === null || typeof result !== 'object') {
    throw new TypeError('Module host load must return source text');
  }

  const prototype = Object.getPrototypeOf(result);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Module source record must be an ordinary object');
  }

  const names = Object.getOwnPropertyNames(result);
  if (
    names.length !== 1 ||
    names[0] !== 'sourceText' ||
    Object.getOwnPropertySymbols(result).length !== 0
  ) {
    throw new TypeError('Module source record must contain only sourceText');
  }

  const descriptor = Object.getOwnPropertyDescriptor(result, 'sourceText');
  if (
    descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
    typeof descriptor.value !== 'string'
  ) {
    throw new TypeError(
      'Module source record sourceText must be a data string',
    );
  }

  return descriptor.value;
}

/**
 * @param {'resolve' | 'load' | 'parse' | 'link' | 'evaluate'} phase
 * @param {string | undefined} identifier
 * @param {unknown} error
 * @returns {ModuleLoaderError}
 */
function asModuleLoaderError(phase, identifier, error) {
  if (error instanceof ModuleLoaderError) {
    return error;
  }

  return new ModuleLoaderError({ phase, identifier, cause: error });
}

/**
 * @param {ModuleLoader} loader
 * @returns {string | undefined}
 */
function currentActiveLoadIdentifier(loader) {
  for (const identifier of moduleLoaderState(loader).activeLoadIdentifiers) {
    return identifier;
  }
  return undefined;
}
