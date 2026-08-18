import { moduleDeclarationInstantiation } from '../evaluator/modules.js';
import { GuestErrorSignal } from './completion.js';
import { ModuleEnvironmentRecord } from './environment.js';
import {
  moduleRequestIndexForEntry,
  MODULE_NAMESPACE_BINDING,
  ModuleLoaderError,
  SourceTextModuleRecord,
} from './module-record.js';

/** @type {WeakMap<SourceTextModuleRecord, Map<string, object>>} */
const RESOLVE_EXPORT_PAIR_KEYS = new WeakMap();

/**
 * Links a graph whose source records and resolved request edges have already
 * been acquired. No host hook is reachable from this operation.
 *
 * @param {SourceTextModuleRecord} rootRecord
 * @returns {SourceTextModuleRecord}
 */
export function linkModuleGraph(rootRecord) {
  if (!(rootRecord instanceof SourceTextModuleRecord)) {
    throw new TypeError('Expected a SourceTextModuleRecord');
  }

  if (rootRecord.status === 'linked') {
    return rootRecord;
  }

  const transaction = new LinkTransaction();

  try {
    linkRecord(rootRecord, transaction);
    initializeNamespaceImportBindings(transaction.records);
    return rootRecord;
  } catch (error) {
    transaction.rollback();

    if (error instanceof ModuleLoaderError) {
      throw error;
    }

    if (error instanceof GuestErrorSignal) {
      throw new ModuleLoaderError({
        phase: 'link',
        identifier: rootRecord.identifier,
        cause: rootRecord.realm.createGuestError(
          error.typeName,
          error.guestMessage,
        ),
      });
    }

    throw new ModuleLoaderError({
      phase: 'link',
      identifier: rootRecord.identifier,
      cause: error,
    });
  }
}

/**
 * Materializes namespace imports only after every SCC reached `linked`. ES2015
 * module instantiation stores the resulting namespace in the immutable local
 * binding, so later evaluation reads cannot trigger namespace construction.
 *
 * @param {Iterable<SourceTextModuleRecord>} records
 * @returns {void}
 */
function initializeNamespaceImportBindings(records) {
  for (const record of records) {
    const environment = record.environment;

    if (!(environment instanceof ModuleEnvironmentRecord)) {
      throw new TypeError('Module environment is not initialized');
    }

    for (const resolvedImport of record.resolvedImportEntries) {
      if (
        resolvedImport.entry.kind !== 'namespace' &&
        resolvedImport.targetName !== MODULE_NAMESPACE_BINDING
      ) {
        continue;
      }

      environment.initializeBinding(
        resolvedImport.entry.localName,
        resolvedImport.targetModule.getNamespace(),
      );
    }
  }
}

/**
 * Resolves one exported name using the module-record pair identity required by
 * ResolveExport. Recursive branches share the same pair set and module-only star
 * set, while each top-level resolution supplies fresh sets.
 *
 * @param {SourceTextModuleRecord} module
 * @param {string} exportName
 * @param {Set<object>} resolveSet
 * @param {Set<SourceTextModuleRecord>} exportStarSet
 * @returns {ExportResolution}
 */
export function resolveExport(module, exportName, resolveSet, exportStarSet) {
  if (!(module instanceof SourceTextModuleRecord)) {
    throw new TypeError('Expected a SourceTextModuleRecord');
  }
  if (typeof exportName !== 'string') {
    throw new TypeError('Expected export name string');
  }
  if (!(resolveSet instanceof Set)) {
    throw new TypeError('Expected ResolveExport pair set');
  }
  if (!(exportStarSet instanceof Set)) {
    throw new TypeError('Expected ResolveExport star set');
  }

  const pair = resolveExportPairKey(module, exportName);

  if (resolveSet.has(pair)) {
    return NOT_FOUND;
  }

  resolveSet.add(pair);
  const localEntry = module.localExportEntries.find(
    (entry) => entry.exportName === exportName,
  );

  if (localEntry !== undefined) {
    return {
      type: 'resolved',
      module,
      bindingName: localEntry.localName,
    };
  }

  const indirectEntry = module.indirectExportEntries.find(
    (entry) => entry.exportName === exportName,
  );

  if (indirectEntry !== undefined) {
    const requestedModule = requestedModuleForEntry(module, indirectEntry);
    if (indirectEntry.importName === '*') {
      return {
        type: 'resolved',
        module: requestedModule,
        bindingName: MODULE_NAMESPACE_BINDING,
      };
    }
    return resolveExport(
      requestedModule,
      indirectEntry.importName,
      resolveSet,
      exportStarSet,
    );
  }

  if (exportName === 'default') {
    return NOT_FOUND;
  }

  if (exportStarSet.has(module)) {
    return NOT_FOUND;
  }

  exportStarSet.add(module);
  /** @type {ExportResolution} */
  let starResolution = NOT_FOUND;

  for (const starEntry of module.starExportEntries) {
    const resolution = resolveExport(
      requestedModuleForEntry(module, starEntry),
      exportName,
      resolveSet,
      exportStarSet,
    );

    if (resolution.type === 'ambiguous') {
      return AMBIGUOUS;
    }

    if (resolution.type === 'not-found') {
      continue;
    }

    if (starResolution.type === 'not-found') {
      starResolution = resolution;
      continue;
    }

    if (!sameResolvedBinding(starResolution, resolution)) {
      return AMBIGUOUS;
    }
  }

  return starResolution;
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {LinkTransaction} transaction
 * @returns {void}
 */
function linkRecord(record, transaction) {
  if (record.status === 'linked') {
    return;
  }

  if (record.status === 'linking') {
    return;
  }

  if (record.status !== 'unlinked') {
    throw new TypeError(`Invalid module link status ${String(record.status)}`);
  }

  assertCompleteGraph(record);
  transaction.touch(record);
  record.status = 'linking';
  record.dfsIndex = transaction.nextDfsIndex;
  record.dfsAncestorIndex = transaction.nextDfsIndex;
  record.dfsOnStack = true;
  transaction.nextDfsIndex += 1;
  transaction.stack.push(record);

  record.environment = new ModuleEnvironmentRecord(
    record.realm.globalEnvironment,
  );
  record.resolvedImportEntries = resolveImportEntries(record);
  moduleDeclarationInstantiation(record);
  validateLocalExportBindings(record);
  validateIndirectExportEntries(record);

  for (const request of record.resolvedRequestedModules) {
    const dependency = request.module;
    linkRecord(dependency, transaction);

    if (dependency.status === 'linking' && dependency.dfsOnStack) {
      record.dfsAncestorIndex = Math.min(
        requiredDfsAncestorIndex(record),
        requiredDfsAncestorIndex(dependency),
      );
    }
  }

  if (requiredDfsAncestorIndex(record) !== requiredDfsIndex(record)) {
    return;
  }

  /** @type {SourceTextModuleRecord[]} */
  const sccMembers = [];

  while (transaction.stack.length > 0) {
    const member = transaction.stack.pop();

    if (member === undefined) {
      throw new TypeError('Module DFS stack unexpectedly empty');
    }

    member.dfsOnStack = false;
    member.status = 'linked';
    sccMembers.push(member);

    if (member === record) {
      const frozenMembers = Object.freeze(sccMembers);
      for (const sccMember of frozenMembers) {
        sccMember.evaluationSccRoot = record;
        sccMember.evaluationSccMembers = frozenMembers;
      }
      return;
    }
  }

  throw new TypeError('Module DFS root was not on the stack');
}

/**
 * Resolves all direct imports before an environment is instantiated. An import
 * retains the final resolved exporting module and binding, rather than the
 * immediate requested module, to make re-exports live bindings as well.
 *
 * @param {SourceTextModuleRecord} record
 * @returns {ReadonlyArray<import('./module-record.js').ResolvedImportEntry>}
 */
function resolveImportEntries(record) {
  /** @type {import('./module-record.js').ResolvedImportEntry[]} */
  const resolutions = [];

  for (const entry of record.importEntries) {
    const requestedModule = requestedModuleForEntry(record, entry);

    if (entry.kind === 'namespace') {
      resolutions.push(
        Object.freeze({
          entry,
          targetModule: requestedModule,
        }),
      );
      continue;
    }

    const resolution = resolveExport(
      requestedModule,
      entry.importName,
      new Set(),
      new Set(),
    );

    if (resolution.type === 'not-found') {
      throwLinkSyntaxError(
        record,
        `The requested module '${requestedModule.identifier}' does not provide an export named '${entry.importName}'`,
      );
    }

    if (resolution.type === 'ambiguous') {
      throwLinkSyntaxError(
        record,
        `The requested module '${requestedModule.identifier}' contains ambiguous exports for '${entry.importName}'`,
      );
    }

    resolutions.push(
      Object.freeze({
        entry,
        targetModule: resolution.module,
        targetName: resolution.bindingName,
      }),
    );
  }

  return Object.freeze(resolutions);
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {void}
 */
function validateLocalExportBindings(record) {
  const environment = record.environment;

  if (!(environment instanceof ModuleEnvironmentRecord)) {
    throw new TypeError('Module environment is not initialized');
  }

  for (const entry of record.localExportEntries) {
    if (!environment.hasBinding(entry.localName)) {
      throwLinkSyntaxError(
        record,
        `Export '${entry.exportName}' is not bound by this module`,
      );
    }
  }
}

/**
 * Every indirect export must be resolvable even when no importer asks for it.
 * Star exports intentionally remain unchecked here: their ambiguous names are
 * omitted by ResolveExport unless a later explicit import or indirect export
 * requests one.
 *
 * @param {SourceTextModuleRecord} record
 * @returns {void}
 */
function validateIndirectExportEntries(record) {
  for (const entry of record.indirectExportEntries) {
    if (entry.importName === '*') {
      continue;
    }
    const requestedModule = requestedModuleForEntry(record, entry);
    const resolution = resolveExport(
      requestedModule,
      entry.importName,
      new Set(),
      new Set(),
    );

    if (resolution.type === 'resolved') {
      continue;
    }

    const reason =
      resolution.type === 'not-found'
        ? `does not provide an export named '${entry.importName}'`
        : `contains ambiguous exports for '${entry.importName}'`;
    throwLinkSyntaxError(
      record,
      `The requested module '${requestedModule.identifier}' ${reason}`,
    );
  }
}

/**
 * Maps one immutable static entry to its exact source-order resolved request.
 * Repeated raw specifiers deliberately use distinct request occurrences: the
 * graph loader owns the canonical target of each occurrence, and this function
 * never invokes a host resolver to rediscover it.
 *
 * @param {SourceTextModuleRecord} record
 * @param {object} targetEntry
 * @returns {SourceTextModuleRecord}
 */
function requestedModuleForEntry(record, targetEntry) {
  const requestIndex = moduleRequestIndexForEntry(targetEntry);
  if (requestIndex === undefined) {
    throw new TypeError('Module entry has no resolved request');
  }
  return requiredResolvedRequest(record, requestIndex).module;
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {number} index
 * @returns {import('./module-record.js').ResolvedModuleRequest}
 */
function requiredResolvedRequest(record, index) {
  const request = record.resolvedRequestedModules[index];

  if (request === undefined) {
    throw new TypeError('Module graph is incomplete');
  }

  return request;
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {void}
 */
function assertCompleteGraph(record) {
  if (
    record.resolvedRequestedModules.length !== record.requestedModules.length
  ) {
    throw new TypeError('Module graph is incomplete');
  }
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {string} message
 * @returns {never}
 */
function throwLinkSyntaxError(record, message) {
  throw new ModuleLoaderError({
    phase: 'link',
    identifier: record.identifier,
    cause: record.realm.createGuestError('SyntaxError', message),
  });
}

/**
 * @param {SourceTextModuleRecord} module
 * @param {string} exportName
 * @returns {object}
 */
function resolveExportPairKey(module, exportName) {
  let names = RESOLVE_EXPORT_PAIR_KEYS.get(module);

  if (names === undefined) {
    names = new Map();
    RESOLVE_EXPORT_PAIR_KEYS.set(module, names);
  }

  let pair = names.get(exportName);

  if (pair === undefined) {
    pair = Object.freeze({});
    names.set(exportName, pair);
  }

  return pair;
}

/**
 * @param {Extract<ExportResolution, { type: 'resolved' }>} left
 * @param {Extract<ExportResolution, { type: 'resolved' }>} right
 * @returns {boolean}
 */
function sameResolvedBinding(left, right) {
  return left.module === right.module && left.bindingName === right.bindingName;
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {number}
 */
function requiredDfsIndex(record) {
  if (record.dfsIndex === undefined) {
    throw new TypeError('Module DFS index is not initialized');
  }

  return record.dfsIndex;
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {number}
 */
function requiredDfsAncestorIndex(record) {
  if (record.dfsAncestorIndex === undefined) {
    throw new TypeError('Module DFS ancestor index is not initialized');
  }

  return record.dfsAncestorIndex;
}

class LinkTransaction {
  constructor() {
    this.nextDfsIndex = 0;
    /** @type {SourceTextModuleRecord[]} */
    this.stack = [];
    /** @type {Set<SourceTextModuleRecord>} */
    this.records = new Set();
  }

  /**
   * The link state always begins unlinked, so retaining each touched record is
   * a complete journal: rollback discards its whole tentative environment rather
   * than trying to undo individual local or import bindings.
   *
   * @param {SourceTextModuleRecord} record
   * @returns {void}
   */
  touch(record) {
    this.records.add(record);
  }

  /**
   * @returns {void}
   */
  rollback() {
    for (const record of this.records) {
      record.environment = null;
      record.namespace = null;
      record.status = 'unlinked';
      record.dfsIndex = undefined;
      record.dfsAncestorIndex = undefined;
      record.dfsOnStack = false;
      record.evaluationSccRoot = null;
      record.evaluationSccMembers = [];
      record.evaluationBodyCompleted = false;
      record.resolvedImportEntries = [];
    }

    this.stack.length = 0;
  }
}

/** @typedef {{ type: 'not-found' } | { type: 'ambiguous' } | { type: 'resolved', module: SourceTextModuleRecord, bindingName: string | typeof MODULE_NAMESPACE_BINDING }} ExportResolution */

/** @type {Extract<ExportResolution, { type: 'not-found' }>} */
const NOT_FOUND = Object.freeze({ type: 'not-found' });

/** @type {Extract<ExportResolution, { type: 'ambiguous' }>} */
const AMBIGUOUS = Object.freeze({ type: 'ambiguous' });
