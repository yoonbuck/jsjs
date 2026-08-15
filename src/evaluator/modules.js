import {
  createFunctionExecutionEnvironment,
  ModuleEnvironmentRecord,
} from '../runtime/environment.js';
import { instantiateFunctionObject } from './declarations.js';
import {
  boundNames,
  isConstantDeclaration,
  topLevelLexicallyScopedDeclarations,
  topLevelVarScopedDeclarations,
} from './static-semantics.js';

/**
 * Creates every binding a source-text module needs before its runtime module
 * items execute. Linking has already resolved each import entry and installed a
 * fresh ModuleEnvironmentRecord on the record.
 *
 * @param {import('../runtime/module-record.js').SourceTextModuleRecord} record
 * @returns {void}
 */
export function moduleDeclarationInstantiation(record) {
  const environment = record.environment;

  if (!(environment instanceof ModuleEnvironmentRecord)) {
    throw new TypeError('Module environment is not initialized');
  }

  const context = moduleContext(record, environment);

  for (const resolvedImport of record.resolvedImportEntries) {
    if (resolvedImport.entry.kind === 'namespace') {
      environment.createNamespaceImportBinding(
        resolvedImport.entry.localName,
        resolvedImport.targetModule,
      );
      continue;
    }

    if (resolvedImport.targetName === undefined) {
      throw new TypeError('Named import is missing a resolved target');
    }

    environment.createImportBinding(
      resolvedImport.entry.localName,
      resolvedImport.targetModule,
      resolvedImport.targetName,
    );
  }

  const items = moduleDeclarationItems(record);
  const varScoped = topLevelVarScopedDeclarations(items);
  const functionDeclarations = varScoped.filter(
    (declaration) => declaration.type === 'FunctionDeclaration',
  );
  const functionNames = new Set();

  for (const declaration of functionDeclarations) {
    const name = declaration.id.name;

    if (!functionNames.has(name)) {
      createModuleMutableBinding(environment, name);
      functionNames.add(name);
    }
  }

  for (const declaration of topLevelLexicallyScopedDeclarations(items)) {
    for (const name of boundNames(declaration)) {
      if (isConstantDeclaration(declaration)) {
        environment.createImmutableBinding(name, true);
      } else {
        createModuleMutableBinding(environment, name);
      }
    }
  }

  const defaultDeclaration = anonymousDefaultDeclaration(record);

  if (defaultDeclaration !== null) {
    createModuleMutableBinding(environment, '*default*');
  }

  const varNames = new Set();
  for (const declaration of varScoped) {
    if (declaration.type !== 'VariableDeclaration') {
      continue;
    }

    for (const name of boundNames(declaration)) {
      if (functionNames.has(name) || varNames.has(name)) {
        continue;
      }

      createModuleMutableBinding(environment, name);
      environment.initializeBinding(name, undefined);
      varNames.add(name);
    }
  }

  for (const declaration of functionDeclarations) {
    environment.initializeBinding(
      declaration.id.name,
      instantiateFunctionObject(declaration, context),
    );
  }

  if (
    defaultDeclaration !== null &&
    defaultDeclaration.type === 'FunctionDeclaration'
  ) {
    environment.initializeBinding(
      '*default*',
      instantiateFunctionObject(defaultDeclaration, context, {
        name: 'default',
      }),
    );
  }
}

/**
 * @param {ModuleEnvironmentRecord} environment
 * @param {string} name
 * @returns {void}
 */
function createModuleMutableBinding(environment, name) {
  if (environment.hasBinding(name)) {
    throw new TypeError(`Module binding ${name} already exists`);
  }

  environment.createMutableBinding(name, false);
}

/**
 * Converts the declaration-bearing module items into the ordinary declaration
 * nodes shared by the existing static-semantic helpers. Import and export-list
 * items intentionally contribute no local declarations.
 *
 * @param {import('../runtime/module-record.js').SourceTextModuleRecord} record
 * @returns {any[]}
 */
function moduleDeclarationItems(record) {
  /** @type {any[]} */
  const items = [];

  for (const item of record.ast.body) {
    if (item.type === 'ExportNamedDeclaration' && item.declaration !== null) {
      items.push(item.declaration);
      continue;
    }

    if (item.type === 'ExportDefaultDeclaration') {
      const declaration = item.declaration;

      if (
        (declaration.type === 'FunctionDeclaration' ||
          declaration.type === 'ClassDeclaration') &&
        declaration.id !== null
      ) {
        items.push(declaration);
      }
      continue;
    }

    if (
      item.type !== 'ImportDeclaration' &&
      item.type !== 'ExportNamedDeclaration' &&
      item.type !== 'ExportAllDeclaration'
    ) {
      items.push(item);
    }
  }

  return items;
}

/**
 * @param {import('../runtime/module-record.js').SourceTextModuleRecord} record
 * @returns {any | null}
 */
function anonymousDefaultDeclaration(record) {
  const defaultEntry = record.localExportEntries.find(
    (entry) =>
      entry.exportName === 'default' && entry.localName === '*default*',
  );

  if (defaultEntry === undefined) {
    return null;
  }

  for (const item of record.ast.body) {
    if (item.type === 'ExportDefaultDeclaration') {
      return item.declaration;
    }
  }

  throw new TypeError('Synthetic default binding has no default declaration');
}

/**
 * @param {import('../runtime/module-record.js').SourceTextModuleRecord} record
 * @param {ModuleEnvironmentRecord} environment
 * @returns {import('./index.js').EvaluationContext}
 */
function moduleContext(record, environment) {
  return {
    realm: record.realm,
    env: environment,
    variableEnv: environment,
    strict: true,
    thisValue: undefined,
    functionEnvironment: createFunctionExecutionEnvironment({
      thisStatus: 'initialized',
      thisValue: undefined,
    }),
  };
}
