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
 * ResolveExport. Branches share the same pair sets while each top-level
 * resolution supplies fresh sets.
 *
 * @param {SourceTextModuleRecord} module
 * @param {string} exportName
 * @param {Set<object>} resolveSet
 * @param {Set<object>} exportStarSet
 * @returns {ExportResolution}
 */
export function resolveExport(module, exportName, resolveSet, exportStarSet) {
  if (!(resolveSet instanceof Set)) {
    throw new TypeError('Expected ResolveExport pair set');
  }
  if (!(exportStarSet instanceof Set)) {
    throw new TypeError('Expected ResolveExport star set');
  }

  /** @type {any[]} */
  const pending = [
    {
      module,
      exportName,
      stage: 'enter',
      starIndex: 0,
      starResolution: NOT_FOUND,
      childResolution: null,
    },
  ];

  while (pending.length > 0) {
    const frame = pending[pending.length - 1];
    /** @type {ExportResolution | null} */
    let completion = null;

    if (frame.stage === 'enter') {
      if (!(frame.module instanceof SourceTextModuleRecord)) {
        throw new TypeError('Expected a SourceTextModuleRecord');
      }
      if (typeof frame.exportName !== 'string') {
        throw new TypeError('Expected export name string');
      }

      const pair = resolveExportPairKey(frame.module, frame.exportName);
      if (resolveSet.has(pair)) {
        completion = NOT_FOUND;
      } else {
        resolveSet.add(pair);
        const localEntry = frame.module.localExportEntries.find(
          (/** @type {any} */ entry) => entry.exportName === frame.exportName,
        );

        if (localEntry !== undefined) {
          completion = {
            type: 'resolved',
            module: frame.module,
            bindingName: localEntry.localName,
          };
        } else {
          const indirectEntry = frame.module.indirectExportEntries.find(
            (/** @type {any} */ entry) => entry.exportName === frame.exportName,
          );

          if (indirectEntry !== undefined) {
            const requestedModule = requestedModuleForEntry(
              frame.module,
              indirectEntry,
            );
            if (indirectEntry.importName === '*') {
              completion = {
                type: 'resolved',
                module: requestedModule,
                bindingName: MODULE_NAMESPACE_BINDING,
              };
            } else {
              frame.stage = 'indirect';
              pending.push({
                module: requestedModule,
                exportName: indirectEntry.importName,
                stage: 'enter',
                starIndex: 0,
                starResolution: NOT_FOUND,
                childResolution: null,
              });
              continue;
            }
          } else if (
            frame.exportName === 'default' ||
            exportStarSet.has(pair)
          ) {
            completion = NOT_FOUND;
          } else {
            exportStarSet.add(pair);
            frame.stage = 'star';
            continue;
          }
        }
      }
    } else if (frame.stage === 'indirect') {
      completion = frame.childResolution;
    } else {
      const childResolution = frame.childResolution;
      if (childResolution !== null) {
        frame.childResolution = null;
        if (childResolution.type === 'ambiguous') {
          completion = AMBIGUOUS;
        } else if (childResolution.type === 'resolved') {
          if (frame.starResolution.type === 'not-found') {
            frame.starResolution = childResolution;
          } else if (
            !sameResolvedBinding(frame.starResolution, childResolution)
          ) {
            completion = AMBIGUOUS;
          }
        }
      }

      if (
        completion === null &&
        frame.starIndex < frame.module.starExportEntries.length
      ) {
        const starEntry = frame.module.starExportEntries[frame.starIndex];
        frame.starIndex += 1;
        pending.push({
          module: requestedModuleForEntry(frame.module, starEntry),
          exportName: frame.exportName,
          stage: 'enter',
          starIndex: 0,
          starResolution: NOT_FOUND,
          childResolution: null,
        });
        continue;
      }
      if (completion === null) {
        completion = frame.starResolution;
      }
    }

    pending.pop();
    if (pending.length === 0) {
      if (completion === null) {
        throw new TypeError('ResolveExport completed without a resolution');
      }
      return completion;
    }
    pending[pending.length - 1].childResolution = completion;
  }

  throw new TypeError('ResolveExport worklist unexpectedly empty');
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {LinkTransaction} transaction
 * @returns {void}
 */
function linkRecord(record, transaction) {
  /** @type {{ record: SourceTextModuleRecord, dependencyIndex: number, entered: boolean }[]} */
  const pending = [{ record, dependencyIndex: 0, entered: false }];

  while (pending.length > 0) {
    const frame = pending[pending.length - 1];
    const current = frame.record;

    if (!frame.entered) {
      if (current.status === 'linked' || current.status === 'linking') {
        pending.pop();
        continue;
      }
      if (current.status !== 'unlinked') {
        throw new TypeError(
          `Invalid module link status ${String(current.status)}`,
        );
      }

      assertCompleteGraph(current);
      transaction.touch(current);
      current.status = 'linking';
      current.dfsIndex = transaction.nextDfsIndex;
      current.dfsAncestorIndex = transaction.nextDfsIndex;
      current.dfsOnStack = true;
      transaction.nextDfsIndex += 1;
      transaction.stack.push(current);
      frame.entered = true;
    }

    if (frame.dependencyIndex < current.resolvedRequestedModules.length) {
      const dependency =
        current.resolvedRequestedModules[frame.dependencyIndex].module;
      if (dependency.status === 'unlinked') {
        pending.push({
          record: dependency,
          dependencyIndex: 0,
          entered: false,
        });
        continue;
      }
      if (dependency.status === 'linking' && dependency.dfsOnStack) {
        current.dfsAncestorIndex = Math.min(
          requiredDfsAncestorIndex(current),
          requiredDfsAncestorIndex(dependency),
        );
      }
      frame.dependencyIndex += 1;
      continue;
    }

    current.environment = new ModuleEnvironmentRecord(
      current.realm.globalEnvironment,
    );
    current.resolvedImportEntries = resolveImportEntries(current);
    moduleDeclarationInstantiation(current);
    validateLocalExportBindings(current);
    validateIndirectExportEntries(current);

    if (requiredDfsAncestorIndex(current) === requiredDfsIndex(current)) {
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

        if (member === current) {
          const frozenMembers = Object.freeze(sccMembers);
          for (const sccMember of frozenMembers) {
            sccMember.evaluationSccRoot = current;
            sccMember.evaluationSccMembers = frozenMembers;
          }
          break;
        }
      }

      if (current.status !== 'linked') {
        throw new TypeError('Module DFS root was not on the stack');
      }
    }

    pending.pop();
  }
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
