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
 *   completedGraphs: Set<string>,
 *   graphDependencies: Map<string, Set<string>>,
 *   cycleOwners: Map<string, string>,
 *   activeLoadIdentifiers: Set<string>,
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
      completedGraphs: new Set(),
      graphDependencies: new Map(),
      cycleOwners: new Map(),
      activeLoadIdentifiers: new Set(),
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

  return awaitCycleOwner(
    loader,
    identifier,
    acquireModuleGraph(loader, identifier, new Set(), undefined),
  );
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
 * @param {Set<string>} ancestors
 * @param {string | undefined} parentIdentifier
 * @returns {Promise<SourceTextModuleRecord>}
 */
function acquireModuleGraph(loader, identifier, ancestors, parentIdentifier) {
  const state = moduleLoaderState(loader);

  if (ancestors.has(identifier)) {
    registerCycle(loader, ancestors, identifier);
    const cyclicRecord = state.records.get(identifier);
    if (cyclicRecord === undefined) {
      throw new Error('Expected parsed cyclic module record');
    }
    return Promise.resolve(cyclicRecord);
  }

  if (parentIdentifier !== undefined) {
    addGraphDependency(loader, parentIdentifier, identifier);
  }

  const cycleOwner = state.cycleOwners.get(identifier);
  if (cycleOwner !== undefined && cycleOwner !== identifier) {
    // This request is already inside the owner graph's traversal. Waiting for
    // the owner here would make a later duplicate request edge await the graph
    // currently awaiting this acquisition (for example, `import "b"; export *
    // from "b"` in the owner of an A↔B cycle). The parsed member record is
    // enough for that internal edge; the owner completes the SCC graph before
    // an external root is allowed to observe it.
    if (ancestors.has(cycleOwner)) {
      const cyclicRecord = state.records.get(identifier);
      if (cyclicRecord === undefined) {
        throw new Error('Expected parsed cyclic module record');
      }
      return Promise.resolve(cyclicRecord);
    }

    const ownerGraph = state.graphInFlight.get(cycleOwner);
    if (ownerGraph !== undefined) {
      return ownerGraph.then(() => {
        const cyclicRecord = state.records.get(identifier);
        if (cyclicRecord === undefined) {
          throw new Error('Expected parsed cyclic module record');
        }
        return cyclicRecord;
      });
    }
  }

  const cached = state.records.get(identifier);
  if (state.completedGraphs.has(identifier) && cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = state.graphInFlight.get(identifier);
  if (pending !== undefined) {
    const cycle =
      parentIdentifier === undefined
        ? undefined
        : graphDependencyPath(loader, identifier, parentIdentifier);
    if (cycle !== undefined) {
      if (cached === undefined) {
        throw new Error('Expected parsed cyclic module record');
      }
      registerCycleMembers(loader, cycle, identifier);
      return Promise.resolve(cached);
    }
    return pending;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(identifier);
  const graph = acquireSourceRecord(loader, identifier)
    .then(async (record) => {
      /** @type {ResolvedModuleRequest[]} */
      const resolvedRequests = [];

      for (const request of record.requestedModules) {
        const childIdentifier = await resolveModule(
          loader,
          request,
          identifier,
        );
        const child = await acquireModuleGraph(
          loader,
          childIdentifier,
          nextAncestors,
          identifier,
        );
        resolvedRequests.push(
          Object.freeze({
            specifier: request,
            identifier: childIdentifier,
            module: child,
          }),
        );
      }

      record.resolvedRequestedModules = Object.freeze(resolvedRequests);
      const cycleOwner = state.cycleOwners.get(identifier);
      if (cycleOwner === undefined || cycleOwner === identifier) {
        completeCycle(loader, identifier);
        state.completedGraphs.add(identifier);
      }
      return record;
    })
    .catch((error) => {
      resetFailedCycle(loader, identifier);
      throw error;
    })
    .finally(() => {
      state.graphInFlight.delete(identifier);
      state.graphDependencies.delete(identifier);
    });

  state.graphInFlight.set(identifier, graph);
  return graph;
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

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @param {Promise<SourceTextModuleRecord>} graph
 * @returns {Promise<SourceTextModuleRecord>}
 */
async function awaitCycleOwner(loader, identifier, graph) {
  const record = await graph;
  const state = moduleLoaderState(loader);
  const owner = state.cycleOwners.get(identifier);
  if (owner !== undefined && owner !== identifier) {
    const ownerGraph = state.graphInFlight.get(owner);
    if (ownerGraph !== undefined) {
      await ownerGraph;
    }
  }
  return record;
}

/**
 * @param {ModuleLoader} loader
 * @param {Set<string>} ancestors
 * @param {string} identifier
 * @returns {void}
 */
function registerCycle(loader, ancestors, identifier) {
  const path = [...ancestors];
  const members = [];
  let found = false;
  for (const member of path) {
    if (member === identifier) {
      found = true;
    }
    if (found) {
      members.push(member);
    }
  }
  registerCycleMembers(loader, members, identifier);
}

/**
 * @param {ModuleLoader} loader
 * @param {string[]} members
 * @param {string} identifier
 * @returns {void}
 */
function registerCycleMembers(loader, members, identifier) {
  const state = moduleLoaderState(loader);
  let owner = identifier;
  for (const member of members) {
    const existingOwner = state.cycleOwners.get(member);
    if (existingOwner !== undefined) {
      owner = existingOwner;
      break;
    }
  }
  for (const member of members) {
    state.cycleOwners.set(member, owner);
  }
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {void}
 */
function completeCycle(loader, identifier) {
  const state = moduleLoaderState(loader);
  for (const [member, owner] of state.cycleOwners) {
    if (owner === identifier) {
      state.completedGraphs.add(member);
      state.cycleOwners.delete(member);
    }
  }
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {void}
 */
function resetFailedCycle(loader, identifier) {
  const state = moduleLoaderState(loader);
  const members = [identifier];
  for (const [member, owner] of state.cycleOwners) {
    if (owner === identifier) {
      members.push(member);
      state.cycleOwners.delete(member);
    }
  }

  for (const member of members) {
    state.completedGraphs.delete(member);
    const record = state.records.get(member);
    if (record !== undefined) {
      record.resolvedRequestedModules = [];
    }
  }
}

/**
 * @param {ModuleLoader} loader
 * @param {string} parent
 * @param {string} child
 * @returns {void}
 */
function addGraphDependency(loader, parent, child) {
  const state = moduleLoaderState(loader);
  let children = state.graphDependencies.get(parent);
  if (children === undefined) {
    children = new Set();
    state.graphDependencies.set(parent, children);
  }
  children.add(child);
}

/**
 * @param {ModuleLoader} loader
 * @param {string} start
 * @param {string} target
 * @returns {string[] | undefined}
 */
function graphDependencyPath(loader, start, target) {
  const state = moduleLoaderState(loader);
  /** @type {Array<[string, string[]]>} */
  const pending = [[start, [start]]];
  const visited = new Set();

  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined) {
      continue;
    }
    const [identifier, path] = next;
    if (identifier === target) {
      return path;
    }
    if (visited.has(identifier)) {
      continue;
    }
    visited.add(identifier);
    const children = state.graphDependencies.get(identifier);
    if (children !== undefined) {
      for (const child of children) {
        pending.push([child, [...path, child]]);
      }
    }
  }

  return undefined;
}
