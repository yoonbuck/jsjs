import { GuestErrorSignal } from './completion.js';
import {
  isAccessorDescriptor,
  validatePropertyDescriptor,
} from './descriptors.js';
import { resolveExport } from './module-linker.js';
import {
  moduleRequestIndexForEntry,
  MODULE_NAMESPACE_BINDING,
  SourceTextModuleRecord,
} from './module-record.js';
import { EngineObject } from './object.js';

/**
 * @typedef {import('./descriptors.js').CompletePropertyDescriptor} CompletePropertyDescriptor
 * @typedef {import('./descriptors.js').PropertyDescriptorRecord} PropertyDescriptorRecord
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 *
 * @typedef {{
 *   module: SourceTextModuleRecord,
 *   bindingName: string | typeof MODULE_NAMESPACE_BINDING,
 * }} ResolvedExport
 */

/**
 * An ES2015 module namespace exotic object. Export descriptors are virtual:
 * each access reads the linked module binding instead of storing a snapshot.
 */
export class ModuleNamespaceObject extends EngineObject {
  /**
   * @param {SourceTextModuleRecord} record
   */
  constructor(record) {
    if (!(record instanceof SourceTextModuleRecord)) {
      throw new TypeError('Expected a SourceTextModuleRecord');
    }
    if (record.status !== 'linked') {
      throw new TypeError('Module must be linked before creating a namespace');
    }

    super(null, 'Module', record.realm.agent);

    /** @type {Map<string, ResolvedExport>} */
    this._resolvedExports = resolveNamespaceExports(record);
    this._exportNames = Object.freeze([...this._resolvedExports.keys()].sort());
    this._toStringTag = record.realm.agent.wellKnownSymbols.toStringTag;

    super.defineOwnProperty(this._toStringTag, {
      value: 'Module',
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.preventExtensions();
  }

  /**
   * @param {PropertyKey} key
   * @returns {CompletePropertyDescriptor | undefined}
   */
  _peekOwnDescriptor(key) {
    const resolved = this._resolvedExports.get(/** @type {string} */ (key));
    return resolved === undefined
      ? super._peekOwnDescriptor(key)
      : exportDescriptor(resolved);
  }

  /**
   * @param {PropertyKey} key
   * @returns {CompletePropertyDescriptor | undefined}
   */
  getOwnProperty(key) {
    const resolved = this._resolvedExports.get(/** @type {string} */ (key));
    return resolved === undefined
      ? super.getOwnProperty(key)
      : exportDescriptor(resolved);
  }

  /**
   * @param {PropertyKey} key
   * @returns {boolean}
   */
  hasProperty(key) {
    if (typeof key === 'string' && this._resolvedExports.has(key)) {
      return true;
    }
    return super.hasProperty(key);
  }

  /**
   * @param {EngineObject | null} prototype
   * @returns {boolean}
   */
  setPrototypeOf(prototype) {
    return prototype === null;
  }

  /**
   * @param {PropertyKey} key
   * @param {PropertyDescriptorRecord} descriptor
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  defineOwnProperty(key, descriptor, throwOnError = false) {
    const resolved = this._resolvedExports.get(/** @type {string} */ (key));

    if (resolved === undefined) {
      return super.defineOwnProperty(key, descriptor, throwOnError);
    }

    const candidate = validatePropertyDescriptor(descriptor);
    const current = exportDescriptor(resolved);

    if (
      candidate.configurable !== true &&
      candidate.enumerable !== false &&
      !isAccessorDescriptor(candidate) &&
      candidate.writable !== false &&
      (!('value' in candidate) || Object.is(candidate.value, current.value))
    ) {
      return true;
    }

    return rejectOperation(
      throwOnError,
      'Cannot redefine a module namespace export',
    );
  }

  /**
   * A module namespace object never accepts an assignment, regardless of
   * `key`, `value`, or `receiver`: every export is a live, non-writable-from
   * this-side binding, and any other key is an own property this exotic
   * object refuses to create (its `[[Extensible]]` is `false` and it has no
   * writable data properties). Overriding the polymorphic `set` (rather than
   * only `put`) is what makes this rejection reach `super.prop = value`
   * assignments too: `SuperReferenceBase#setReferencedValue` and ordinary
   * `EngineObject#set`'s prototype walk both dispatch to whichever object's
   * `set` governs the lookup, receiver and all.
   *
   * @param {PropertyKey} _key
   * @param {unknown} _value
   * @param {unknown} _receiver
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  set(_key, _value, _receiver, throwOnError = false) {
    return rejectOperation(
      throwOnError,
      'Cannot assign to a module namespace object',
    );
  }

  /**
   * @param {PropertyKey} key
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  delete(key, throwOnError = false) {
    if (this._resolvedExports.has(/** @type {string} */ (key))) {
      return rejectOperation(
        throwOnError,
        'Cannot delete a module namespace export',
      );
    }

    return super.delete(key, throwOnError);
  }

  /**
   * @returns {PropertyKey[]}
   */
  ownPropertyKeys() {
    return [...this._exportNames, ...super.ownPropertyKeys()];
  }
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {Map<string, ResolvedExport>}
 */
function resolveNamespaceExports(record) {
  /** @type {Map<string, ResolvedExport>} */
  const resolvedExports = new Map();

  for (const exportName of exportedNames(record, new Set())) {
    const resolution = resolveExport(record, exportName, new Set());

    if (resolution.type === 'resolved') {
      resolvedExports.set(exportName, {
        module: resolution.module,
        bindingName: resolution.bindingName,
      });
    }
  }

  return resolvedExports;
}

/**
 * Gets the candidate exported names from local, indirect, and star entries.
 * Every candidate is resolved separately by the namespace constructor so
 * ambiguous names are omitted.
 *
 * @param {SourceTextModuleRecord} record
 * @param {Set<SourceTextModuleRecord>} exportStarSet
 * @returns {Set<string>}
 */
function exportedNames(record, exportStarSet) {
  if (exportStarSet.has(record)) {
    return new Set();
  }

  exportStarSet.add(record);
  /** @type {Set<string>} */
  const names = new Set();

  for (const entry of record.localExportEntries) {
    names.add(entry.exportName);
  }
  for (const entry of record.indirectExportEntries) {
    names.add(entry.exportName);
  }
  for (const entry of record.starExportEntries) {
    const target = requestedModuleForStarEntry(record, entry);

    for (const name of exportedNames(target, exportStarSet)) {
      if (name !== 'default') {
        names.add(name);
      }
    }
  }

  return names;
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {object} targetEntry
 * @returns {SourceTextModuleRecord}
 */
function requestedModuleForStarEntry(record, targetEntry) {
  const requestIndex = moduleRequestIndexForEntry(targetEntry);
  if (requestIndex === undefined) {
    throw new TypeError('Star export entry has no resolved request');
  }
  const request = record.resolvedRequestedModules[requestIndex];
  if (request === undefined) {
    throw new TypeError('Module graph is incomplete');
  }
  return request.module;
}

/**
 * @param {ResolvedExport} resolved
 * @returns {CompletePropertyDescriptor}
 */
function exportDescriptor(resolved) {
  if (resolved.bindingName === MODULE_NAMESPACE_BINDING) {
    return {
      value: resolved.module.getNamespace(),
      writable: true,
      enumerable: true,
      configurable: false,
    };
  }

  const environment = resolved.module.environment;

  if (environment === null) {
    throw new TypeError('Exported module environment is not initialized');
  }

  return {
    value: environment.getBindingValue(resolved.bindingName, true),
    writable: true,
    enumerable: true,
    configurable: false,
  };
}

/**
 * @param {boolean} throwOnError
 * @param {string} message
 * @returns {false}
 */
function rejectOperation(throwOnError, message) {
  if (throwOnError) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return false;
}
