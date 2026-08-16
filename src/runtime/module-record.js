import { boundNames } from '../evaluator/static-semantics.js';
import { ModuleNamespaceObject } from './module-namespace.js';

/** @type {WeakMap<object, object>} */
const IMPORTED_REEXPORT_IMPORT_ENTRIES = new WeakMap();
/** @type {WeakMap<object, number>} */
const MODULE_REQUEST_INDICES = new WeakMap();
export const MODULE_NAMESPACE_BINDING = Symbol('Module namespace binding');

/**
 * The static products of parsing an ES2015 source-text module. Linking and
 * evaluation populate the mutable record state; the AST and entry lists stay
 * engine-owned parse products.
 */
export class SourceTextModuleRecord {
  /**
   * @param {{ realm: any, identifier: string, ast: any }} options
   */
  constructor({ realm, identifier, ast }) {
    this.realm = realm;
    this.identifier = identifier;
    this.ast = ast;

    /** @type {string[]} */
    const requestedModules = [];
    /** @type {any[]} */
    const importEntries = [];
    /** @type {any[]} */
    const localExportEntries = [];
    /** @type {any[]} */
    const indirectExportEntries = [];
    /** @type {any[]} */
    const starExportEntries = [];
    /** @type {Map<any, any[]>} */
    const importEntriesByDeclaration = new Map();

    /**
     * @param {string} moduleRequest
     * @returns {number}
     */
    const addRequest = (moduleRequest) => {
      const requestIndex = requestedModules.length;
      requestedModules.push(moduleRequest);
      return requestIndex;
    };

    for (const declaration of ast.body) {
      if (declaration.type === 'ImportDeclaration') {
        const firstEntry = importEntries.length;
        extractImportEntries(declaration, importEntries);
        importEntriesByDeclaration.set(
          declaration,
          importEntries.slice(firstEntry),
        );
      }
    }

    for (const declaration of ast.body) {
      switch (declaration.type) {
        case 'ImportDeclaration': {
          const requestIndex = addRequest(declaration.source.value);
          const declarationEntries =
            importEntriesByDeclaration.get(declaration);
          if (declarationEntries === undefined) {
            throw new TypeError('Import declaration entries are missing');
          }
          for (const entry of declarationEntries) {
            MODULE_REQUEST_INDICES.set(entry, requestIndex);
          }
          break;
        }
        case 'ExportNamedDeclaration':
          extractNamedExportEntries(
            declaration,
            addRequest,
            importEntries,
            localExportEntries,
            indirectExportEntries,
          );
          break;
        case 'ExportDefaultDeclaration':
          localExportEntries.push(
            freezeEntry({
              exportName: 'default',
              localName: defaultExportLocalName(declaration.declaration),
            }),
          );
          break;
        case 'ExportAllDeclaration': {
          const requestIndex = addRequest(declaration.source.value);
          const entry = freezeEntry({
            moduleRequest: declaration.source.value,
          });
          MODULE_REQUEST_INDICES.set(entry, requestIndex);
          starExportEntries.push(entry);
          break;
        }
        default:
          break;
      }
    }

    for (const entry of indirectExportEntries) {
      const imported = IMPORTED_REEXPORT_IMPORT_ENTRIES.get(entry);
      if (imported === undefined) {
        continue;
      }
      const requestIndex = MODULE_REQUEST_INDICES.get(imported);
      if (requestIndex === undefined) {
        throw new TypeError('Imported re-export request is missing');
      }
      MODULE_REQUEST_INDICES.set(entry, requestIndex);
    }

    this.requestedModules = Object.freeze(requestedModules);
    this.importEntries = Object.freeze(importEntries);
    this.localExportEntries = Object.freeze(localExportEntries);
    this.indirectExportEntries = Object.freeze(indirectExportEntries);
    this.starExportEntries = Object.freeze(starExportEntries);
    /** @type {ReadonlyArray<ResolvedModuleRequest>} */
    this.resolvedRequestedModules = [];

    /** @type {any} */
    this.environment = null;
    /** @type {any} */
    this.namespace = null;
    this.status = 'unlinked';
    /** @type {number | undefined} */
    this.dfsIndex = undefined;
    /** @type {number | undefined} */
    this.dfsAncestorIndex = undefined;
    this.dfsOnStack = false;
    /** @type {SourceTextModuleRecord | null} */
    this.evaluationSccRoot = null;
    /** @type {ReadonlyArray<SourceTextModuleRecord>} */
    this.evaluationSccMembers = [];
    /** @type {ReadonlyArray<ResolvedImportEntry>} */
    this.resolvedImportEntries = [];
    /** @type {'unevaluated' | 'evaluating' | 'evaluated' | 'errored'} */
    this.evaluationStatus = 'unevaluated';
    /** @type {{ type: 'normal' | 'throw', value: unknown } | null} */
    this.evaluationCompletion = null;
    this.evaluationBodyCompleted = false;
  }

  /**
   * @returns {any}
   */
  getNamespace() {
    if (this.namespace !== null) {
      return this.namespace;
    }

    this.namespace = new ModuleNamespaceObject(this);
    return this.namespace;
  }
}

/**
 * @typedef {{
 *   specifier: string,
 *   identifier: string,
 *   module: SourceTextModuleRecord,
 * }} ResolvedModuleRequest
 */

/**
 * One import entry resolved during linking. The entry remains the immutable
 * parse product; this separate link-state record carries its live target.
 *
 * @typedef {{
 *   entry: Readonly<{
 *     moduleRequest: string,
 *     importName: string,
 *     localName: string,
 *     kind: 'named' | 'namespace',
 *   }>,
 *   targetModule: SourceTextModuleRecord,
 *   targetName?: string | typeof MODULE_NAMESPACE_BINDING,
 * }} ResolvedImportEntry
 */

/**
 * A failure crossing the portable module host boundary.
 */
export class ModuleLoaderError extends Error {
  /**
   * @param {{
   *   phase: 'resolve' | 'load' | 'parse' | 'link' | 'evaluate',
   *   identifier?: string,
   *   cause?: unknown,
   *   value?: unknown,
   * }} options
   */
  constructor(options) {
    super(`Module ${options.phase} failed`);
    this.name = 'ModuleLoaderError';
    this.phase = options.phase;

    if (options.identifier !== undefined) {
      this.identifier = options.identifier;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'cause')) {
      this.cause = options.cause;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'value')) {
      this.value = options.value;
    }
  }
}

/**
 * @param {any} declaration
 * @param {any[]} entries
 * @returns {void}
 */
function extractImportEntries(declaration, entries) {
  const moduleRequest = declaration.source.value;

  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ImportDefaultSpecifier') {
      entries.push(
        freezeEntry({
          moduleRequest,
          importName: 'default',
          localName: specifier.local.name,
          kind: 'named',
        }),
      );
    } else if (specifier.type === 'ImportNamespaceSpecifier') {
      entries.push(
        freezeEntry({
          moduleRequest,
          importName: '*',
          localName: specifier.local.name,
          kind: 'namespace',
        }),
      );
    } else {
      entries.push(
        freezeEntry({
          moduleRequest,
          importName: specifier.imported.name,
          localName: specifier.local.name,
          kind: 'named',
        }),
      );
    }
  }
}

/**
 * @param {any} declaration
 * @param {(moduleRequest: string) => number} addRequest
 * @param {any[]} importEntries
 * @param {any[]} localEntries
 * @param {any[]} indirectEntries
 * @returns {void}
 */
function extractNamedExportEntries(
  declaration,
  addRequest,
  importEntries,
  localEntries,
  indirectEntries,
) {
  if (declaration.declaration !== null) {
    for (const localName of boundNames(declaration.declaration)) {
      localEntries.push(freezeEntry({ exportName: localName, localName }));
    }
    return;
  }

  if (declaration.source === null) {
    for (const specifier of declaration.specifiers) {
      const imported = importEntries.find(
        (entry) => entry.localName === specifier.local.name,
      );
      if (imported === undefined) {
        localEntries.push(
          freezeEntry({
            exportName: specifier.exported.name,
            localName: specifier.local.name,
          }),
        );
        continue;
      }

      const entry = freezeEntry({
        moduleRequest: imported.moduleRequest,
        importName: imported.importName,
        exportName: specifier.exported.name,
      });
      IMPORTED_REEXPORT_IMPORT_ENTRIES.set(entry, imported);
      indirectEntries.push(entry);
    }
    return;
  }

  const moduleRequest = declaration.source.value;
  const requestIndex = addRequest(moduleRequest);
  for (const specifier of declaration.specifiers) {
    const entry = freezeEntry({
      moduleRequest,
      importName: specifier.local.name,
      exportName: specifier.exported.name,
    });
    MODULE_REQUEST_INDICES.set(entry, requestIndex);
    indirectEntries.push(entry);
  }
}

/**
 * @param {object} entry
 * @returns {object | undefined}
 */
export function importedReExportImportEntry(entry) {
  return IMPORTED_REEXPORT_IMPORT_ENTRIES.get(entry);
}

/**
 * @param {object} entry
 * @returns {number | undefined}
 */
export function moduleRequestIndexForEntry(entry) {
  return MODULE_REQUEST_INDICES.get(entry);
}

/**
 * @param {any} declaration
 * @returns {string}
 */
function defaultExportLocalName(declaration) {
  if (
    (declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'ClassDeclaration') &&
    declaration.id !== null
  ) {
    return declaration.id.name;
  }

  return '*default*';
}

/**
 * @template {Record<string, unknown>} T
 * @param {T} entry
 * @returns {Readonly<T>}
 */
function freezeEntry(entry) {
  return Object.freeze(entry);
}
