import { boundNames } from '../evaluator/static-semantics.js';

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

    /** @param {string} moduleRequest */
    const addRequest = (moduleRequest) => {
      requestedModules.push(moduleRequest);
    };

    for (const declaration of ast.body) {
      switch (declaration.type) {
        case 'ImportDeclaration':
          addRequest(declaration.source.value);
          extractImportEntries(declaration, importEntries);
          break;
        case 'ExportNamedDeclaration':
          extractNamedExportEntries(
            declaration,
            addRequest,
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
        case 'ExportAllDeclaration':
          addRequest(declaration.source.value);
          starExportEntries.push(
            freezeEntry({ moduleRequest: declaration.source.value }),
          );
          break;
        default:
          break;
      }
    }

    this.requestedModules = Object.freeze(requestedModules);
    this.importEntries = Object.freeze(importEntries);
    this.localExportEntries = Object.freeze(localExportEntries);
    this.indirectExportEntries = Object.freeze(indirectExportEntries);
    this.starExportEntries = Object.freeze(starExportEntries);
    /** @type {ReadonlyArray<ResolvedModuleRequest>} */
    this.resolvedRequestedModules = [];

    this.environment = null;
    /** @type {any} */
    this.namespace = null;
    this.status = 'unlinked';
    this.dfsIndex = undefined;
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
    /** @type {ModuleLoaderError | null} */
    this.evaluationError = null;
  }

  /**
   * @returns {any}
   */
  getNamespace() {
    if (this.namespace !== null) {
      return this.namespace;
    }

    throw new TypeError('Module namespace is not initialized');
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
 *   targetName?: string,
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
 * @param {(moduleRequest: string) => void} addRequest
 * @param {any[]} localEntries
 * @param {any[]} indirectEntries
 * @returns {void}
 */
function extractNamedExportEntries(
  declaration,
  addRequest,
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
      localEntries.push(
        freezeEntry({
          exportName: specifier.exported.name,
          localName: specifier.local.name,
        }),
      );
    }
    return;
  }

  const moduleRequest = declaration.source.value;
  addRequest(moduleRequest);
  for (const specifier of declaration.specifiers) {
    indirectEntries.push(
      freezeEntry({
        moduleRequest,
        importName: specifier.local.name,
        exportName: specifier.exported.name,
      }),
    );
  }
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
