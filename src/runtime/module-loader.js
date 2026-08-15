import { parseModule } from '../parser.js';
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
    this.realm = realm;
    this.host = validateModuleHost(host);
    /** @type {Map<string, SourceTextModuleRecord>} */
    this.records = new Map();
    /** @type {Map<string, Map<string | null, Promise<string>>>} */
    this.resolveInFlight = new Map();
    /** @type {Map<string, Promise<SourceTextModuleRecord>>} */
    this.loadInFlight = new Map();
    /** @type {Map<string, Promise<SourceTextModuleRecord>>} */
    this.graphInFlight = new Map();
    /** @type {Set<string>} */
    this.completedGraphs = new Set();
    /** @type {Map<string, Set<string>>} */
    this.graphDependencies = new Map();
    /** @type {Map<string, string>} */
    this.cycleOwners = new Map();
    /** @type {Set<string>} */
    this.activeLoadIdentifiers = new Set();
  }

  /**
   * Acquires the source graph. Linking, evaluation, and its namespace result
   * are added at this one host-facing boundary by later module tasks.
   *
   * @param {string} specifier
   * @param {string | null} [referrer=null]
   * @returns {Promise<undefined>}
   */
  async loadAndEvaluate(specifier, referrer = null) {
    await loadModuleGraph(this, specifier, referrer);
    return undefined;
  }
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
  let byReferrer = loader.resolveInFlight.get(specifier);
  if (byReferrer === undefined) {
    byReferrer = new Map();
    loader.resolveInFlight.set(specifier, byReferrer);
  }

  const pending = byReferrer.get(referrer);
  if (pending !== undefined) {
    return pending;
  }

  const resolution = Promise.resolve()
    .then(() => loader.host.resolve(specifier, referrer))
    .then((identifier) => {
      if (typeof identifier !== 'string' || identifier.length === 0) {
        throw new TypeError('Module host resolve must return a non-empty string');
      }
      return identifier;
    })
    .catch((error) => {
      throw asModuleLoaderError('resolve', undefined, error);
    })
    .finally(() => {
      byReferrer.delete(referrer);
      if (byReferrer.size === 0) {
        loader.resolveInFlight.delete(specifier);
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
  if (ancestors.has(identifier)) {
    registerCycle(loader, ancestors, identifier);
    const cyclicRecord = loader.records.get(identifier);
    if (cyclicRecord === undefined) {
      throw new Error('Expected parsed cyclic module record');
    }
    return Promise.resolve(cyclicRecord);
  }

  if (parentIdentifier !== undefined) {
    addGraphDependency(loader, parentIdentifier, identifier);
  }

  const cycleOwner = loader.cycleOwners.get(identifier);
  if (cycleOwner !== undefined && cycleOwner !== identifier) {
    const ownerGraph = loader.graphInFlight.get(cycleOwner);
    if (ownerGraph !== undefined) {
      return ownerGraph;
    }
  }

  const cached = loader.records.get(identifier);
  if (loader.completedGraphs.has(identifier) && cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = loader.graphInFlight.get(identifier);
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
        const childIdentifier = await resolveModule(loader, request, identifier);
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
      const cycleOwner = loader.cycleOwners.get(identifier);
      if (cycleOwner === undefined || cycleOwner === identifier) {
        completeCycle(loader, identifier);
        loader.completedGraphs.add(identifier);
      }
      return record;
    })
    .catch((error) => {
      resetFailedCycle(loader, identifier);
      throw error;
    })
    .finally(() => {
      loader.graphInFlight.delete(identifier);
      loader.graphDependencies.delete(identifier);
    });

  loader.graphInFlight.set(identifier, graph);
  return graph;
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {Promise<SourceTextModuleRecord>}
 */
function acquireSourceRecord(loader, identifier) {
  const cached = loader.records.get(identifier);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  if (loader.activeLoadIdentifiers.has(identifier)) {
    return Promise.reject(
      new ModuleLoaderError({
        phase: 'load',
        identifier,
        cause: new Error('Module load hook reentered its active identifier'),
      }),
    );
  }

  const pending = loader.loadInFlight.get(identifier);
  if (pending !== undefined) {
    return pending;
  }

  const source = Promise.resolve()
    .then(async () => {
      let result;
      loader.activeLoadIdentifiers.add(identifier);
      try {
        result = loader.host.load(identifier);
      } catch (error) {
        throw asModuleLoaderError('load', identifier, error);
      } finally {
        loader.activeLoadIdentifiers.delete(identifier);
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
          realm: loader.realm,
          identifier,
          ast,
        });
        loader.records.set(identifier, record);
        return record;
      } catch (error) {
        throw asModuleLoaderError('load', identifier, error);
      }
    })
    .finally(() => {
      loader.loadInFlight.delete(identifier);
    });

  loader.loadInFlight.set(identifier, source);
  return source;
}

/**
 * @param {unknown} host
 * @returns {ModuleHost}
 */
function validateModuleHost(host) {
  if (host === null || (typeof host !== 'object' && typeof host !== 'function')) {
    throw new TypeError('Expected module host object');
  }

  const candidate = /** @type {{ resolve?: unknown, load?: unknown }} */ (host);
  if (
    typeof candidate.resolve !== 'function' ||
    typeof candidate.load !== 'function'
  ) {
    throw new TypeError('Expected module host resolve and load functions');
  }

  return /** @type {ModuleHost} */ (host);
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
    throw new TypeError('Module source record sourceText must be a data string');
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
  for (const identifier of loader.activeLoadIdentifiers) {
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
  const owner = loader.cycleOwners.get(identifier);
  if (owner !== undefined && owner !== identifier) {
    const ownerGraph = loader.graphInFlight.get(owner);
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
  let owner = identifier;
  for (const member of members) {
    const existingOwner = loader.cycleOwners.get(member);
    if (existingOwner !== undefined) {
      owner = existingOwner;
      break;
    }
  }
  for (const member of members) {
    loader.cycleOwners.set(member, owner);
  }
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {void}
 */
function completeCycle(loader, identifier) {
  for (const [member, owner] of loader.cycleOwners) {
    if (owner === identifier) {
      loader.completedGraphs.add(member);
      loader.cycleOwners.delete(member);
    }
  }
}

/**
 * @param {ModuleLoader} loader
 * @param {string} identifier
 * @returns {void}
 */
function resetFailedCycle(loader, identifier) {
  const members = [identifier];
  for (const [member, owner] of loader.cycleOwners) {
    if (owner === identifier) {
      members.push(member);
      loader.cycleOwners.delete(member);
    }
  }

  for (const member of members) {
    loader.completedGraphs.delete(member);
    const record = loader.records.get(member);
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
  let children = loader.graphDependencies.get(parent);
  if (children === undefined) {
    children = new Set();
    loader.graphDependencies.set(parent, children);
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
    const children = loader.graphDependencies.get(identifier);
    if (children !== undefined) {
      for (const child of children) {
        pending.push([child, [...path, child]]);
      }
    }
  }

  return undefined;
}
