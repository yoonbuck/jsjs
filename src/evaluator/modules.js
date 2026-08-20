import {
  createFunctionExecutionEnvironment,
  ModuleEnvironmentRecord,
} from '../runtime/environment.js';
import {
  EMPTY,
  createNormalCompletion,
  GuestErrorSignal,
  ThrowSignal,
} from '../runtime/completion.js';
import {
  evaluateNamedExpression,
  instantiateFunctionObject,
} from './declarations.js';
import { evaluateStatement } from './statements.js';
import {
  MODULE_NAMESPACE_BINDING,
  SourceTextModuleRecord,
} from '../runtime/module-record.js';
import {
  boundNames,
  isConstantDeclaration,
  topLevelLexicallyScopedDeclarations,
  topLevelVarScopedDeclarations,
} from './static-semantics.js';

const EVALUATION_DEFERRED = Symbol('module evaluation deferred');

/** @type {WeakMap<SourceTextModuleRecord, Set<SourceTextModuleRecord>>} */
const DEFERRED_EVALUATION_DEPENDENTS = new WeakMap();

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
    if (
      resolvedImport.entry.kind === 'namespace' ||
      resolvedImport.targetName === MODULE_NAMESPACE_BINDING
    ) {
      environment.createImmutableBinding(resolvedImport.entry.localName, true);
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
 * Evaluates a linked source-text module graph synchronously. The graph traversal
 * follows the already-resolved source-order request edges, so it never invokes a
 * host hook or schedules a job.
 *
 * @param {SourceTextModuleRecord} rootRecord
 * @returns {SourceTextModuleRecord}
 */
export function evaluateModuleGraph(rootRecord) {
  return rootRecord.realm.agent.withActiveExecutionRealm(rootRecord.realm, () =>
    evaluateModule(rootRecord),
  );
}

/**
 * Evaluates one linked module and its source-order dependencies. A record that
 * is currently evaluating represents the back edge of an SCC: its declaration
 * instantiation has already made hoisted functions and live imports available,
 * so the back edge does not evaluate it again.
 *
 * @param {SourceTextModuleRecord} record
 * @returns {SourceTextModuleRecord}
 */
export function evaluateModule(record) {
  evaluateModuleRecord(record, new ModuleEvaluationTransaction());
  return record;
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {ModuleEvaluationTransaction} transaction
 * @returns {SourceTextModuleRecord | typeof EVALUATION_DEFERRED}
 */
function evaluateModuleRecord(record, transaction) {
  /** @type {{ record: SourceTextModuleRecord, dependencyIndex: number, entered: boolean }[]} */
  const pending = [{ record, dependencyIndex: 0, entered: false }];
  try {
    while (pending.length > 0) {
      const frame = pending[pending.length - 1];
      const current = frame.record;

      if (!frame.entered) {
        if (!(current instanceof SourceTextModuleRecord)) {
          throw new TypeError('Expected a SourceTextModuleRecord');
        }
        if (current.status !== 'linked') {
          throw new TypeError('Module must be linked before evaluation');
        }

        if (current.evaluationStatus === 'evaluated') {
          pending.pop();
          continue;
        }
        if (current.evaluationStatus === 'errored') {
          throw new ThrowSignal(requiredAbruptValue(current));
        }
        if (current.evaluationStatus === 'evaluating') {
          if (transaction.owns(current)) {
            pending.pop();
            continue;
          }

          transaction.deferOn(current);
          abortModuleEvaluationFrames(pending, transaction);
          return EVALUATION_DEFERRED;
        }
        if (current.evaluationStatus !== 'unevaluated') {
          throw new TypeError(
            `Invalid module evaluation status ${String(
              current.evaluationStatus,
            )}`,
          );
        }
        if (!(current.environment instanceof ModuleEnvironmentRecord)) {
          throw new TypeError('Module environment is not initialized');
        }

        current.evaluationStatus = 'evaluating';
        transaction.enter(current);
        frame.entered = true;
      }

      if (frame.dependencyIndex < current.resolvedRequestedModules.length) {
        const dependency =
          current.resolvedRequestedModules[frame.dependencyIndex].module;
        frame.dependencyIndex += 1;
        pending.push({
          record: dependency,
          dependencyIndex: 0,
          entered: false,
        });
        continue;
      }

      if (!current.evaluationBodyCompleted) {
        const context = moduleContext(current, current.environment);
        for (const item of current.ast.body) {
          const completion = evaluateModuleItem(item, current, context);

          if (completion.type === 'throw') {
            throw new ThrowSignal(completion.value);
          }
          if (completion.type !== 'normal') {
            throw new TypeError(
              `Invalid module item completion ${String(completion.type)}`,
            );
          }
        }

        current.evaluationBodyCompleted = true;
      }

      transaction.completeNormally(current);
      pending.pop();
    }

    return record;
  } catch (error) {
    if (error instanceof ThrowSignal || error instanceof GuestErrorSignal) {
      const value =
        error instanceof ThrowSignal
          ? error.value
          : deepestEnteredModule(pending).realm.createGuestError(
              error.typeName,
              error.guestMessage,
            );
      const completedRoots = new Set();
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (pending[index].entered) {
          const frameRecord = pending[index].record;
          const root = requiredEvaluationSccRoot(frameRecord);
          if (!completedRoots.has(root)) {
            completedRoots.add(root);
            transaction.completeAbruptly(frameRecord, value);
          }
        }
      }
      throw new ThrowSignal(value);
    }

    abortModuleEvaluationFrames(pending, transaction);
    throw error;
  }
}

/**
 * @param {{ record: SourceTextModuleRecord, entered: boolean }[]} pending
 * @param {ModuleEvaluationTransaction} transaction
 * @returns {void}
 */
function abortModuleEvaluationFrames(pending, transaction) {
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    if (pending[index].entered) {
      transaction.abort(pending[index].record);
    }
  }
}

/**
 * @param {{ record: SourceTextModuleRecord, entered: boolean }[]} pending
 * @returns {SourceTextModuleRecord}
 */
function deepestEnteredModule(pending) {
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    if (pending[index].entered) {
      return pending[index].record;
    }
  }
  throw new TypeError('Module evaluation error has no active record');
}

/**
 * @param {any} item
 * @param {SourceTextModuleRecord} record
 * @param {import('./index.js').EvaluationContext} context
 * @returns {{ type: string, value: unknown }}
 */
function evaluateModuleItem(item, record, context) {
  switch (item.type) {
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
      return createNormalCompletion(EMPTY);
    case 'ExportNamedDeclaration':
      return item.declaration === null
        ? createNormalCompletion(EMPTY)
        : evaluateModuleDeclaration(item.declaration, context);
    case 'ExportDefaultDeclaration':
      return evaluateDefaultExportDeclaration(
        item.declaration,
        record,
        context,
      );
    default:
      return evaluateModuleDeclaration(item, context);
  }
}

/**
 * Function declarations were initialized during linking. All other declaration
 * forms retain their ordinary runtime evaluation semantics against the existing
 * module environment.
 *
 * @param {any} declaration
 * @param {import('./index.js').EvaluationContext} context
 * @returns {{ type: string, value: unknown }}
 */
function evaluateModuleDeclaration(declaration, context) {
  if (declaration.type === 'FunctionDeclaration') {
    return createNormalCompletion(EMPTY);
  }

  return evaluateStatement(declaration, context);
}

/**
 * @param {any} declaration
 * @param {SourceTextModuleRecord} record
 * @param {import('./index.js').EvaluationContext} context
 * @returns {{ type: string, value: unknown }}
 */
function evaluateDefaultExportDeclaration(declaration, record, context) {
  if (declaration.type === 'FunctionDeclaration') {
    return createNormalCompletion(EMPTY);
  }

  if (declaration.type === 'ClassDeclaration' && declaration.id !== null) {
    return evaluateModuleDeclaration(declaration, context);
  }

  const environment = record.environment;
  if (!(environment instanceof ModuleEnvironmentRecord)) {
    throw new TypeError('Module environment is not initialized');
  }

  environment.initializeBinding(
    '*default*',
    evaluateNamedExpression(declaration, context, 'default'),
  );
  return createNormalCompletion(EMPTY);
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {unknown}
 */
function requiredAbruptValue(record) {
  const completion = record.evaluationCompletion;

  if (completion?.type !== 'throw') {
    throw new TypeError('Errored module is missing an abrupt completion');
  }

  return completion.value;
}

/**
 * Keeps the currently evaluating records partitioned by the exact SCC root
 * assigned during linking. A member's body can finish before its SCC's source
 * order is exhausted, so only the final active member commits the normal
 * completion; an abrupt completion instead applies to every active member.
 */
class ModuleEvaluationTransaction {
  constructor() {
    /** @type {Map<SourceTextModuleRecord, Set<SourceTextModuleRecord>>} */
    this.activeRecords = new Map();
    /** @type {Map<SourceTextModuleRecord, Set<SourceTextModuleRecord>>} */
    this.completedBodies = new Map();
  }

  /**
   * @param {SourceTextModuleRecord} record
   * @returns {void}
   */
  enter(record) {
    const root = requiredEvaluationSccRoot(record);
    let active = this.activeRecords.get(root);

    if (active === undefined) {
      active = new Set();
      this.activeRecords.set(root, active);
      this.completedBodies.set(root, new Set());
    }

    active.add(record);
  }

  /**
   * @param {SourceTextModuleRecord} record
   * @returns {boolean}
   */
  owns(record) {
    for (const active of this.activeRecords.values()) {
      if (active.has(record)) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {SourceTextModuleRecord} record
   * @returns {void}
   */
  completeNormally(record) {
    const root = requiredEvaluationSccRoot(record);
    const active = this.activeRecords.get(root);
    const completed = this.completedBodies.get(root);
    const members = requiredEvaluationSccMembers(record);

    if (active === undefined || completed === undefined) {
      throw new TypeError('Module evaluation transaction is not active');
    }

    completed.add(record);
    if (completed.size !== members.length) {
      return;
    }

    for (const member of members) {
      member.evaluationCompletion = Object.freeze({
        type: 'normal',
        value: undefined,
      });
      member.evaluationStatus = 'evaluated';
      DEFERRED_EVALUATION_DEPENDENTS.delete(member);
    }
    this.clear(root);
  }

  /**
   * @param {SourceTextModuleRecord} record
   * @param {unknown} value
   * @returns {void}
   */
  completeAbruptly(record, value) {
    const root = requiredEvaluationSccRoot(record);
    const members = requiredEvaluationSccMembers(record);

    markModuleSccAbruptly(record, value);
    const completed = new Set();
    for (const member of members) {
      completeDeferredDependentsAbruptly(member, value, completed);
    }
    this.clear(root);
  }

  /**
   * Records every active caller in this transaction as waiting for an in-flight
   * dependency owned by another synchronous evaluation transaction.
   *
   * @param {SourceTextModuleRecord} dependency
   * @returns {void}
   */
  deferOn(dependency) {
    let dependents = DEFERRED_EVALUATION_DEPENDENTS.get(dependency);

    if (dependents === undefined) {
      dependents = new Set();
      DEFERRED_EVALUATION_DEPENDENTS.set(dependency, dependents);
    }

    for (const active of this.activeRecords.values()) {
      for (const record of active) {
        dependents.add(record);
      }
    }
  }

  /**
   * @param {SourceTextModuleRecord} record
   * @returns {void}
   */
  abort(record) {
    const root = requiredEvaluationSccRoot(record);
    const active = this.activeRecords.get(root);

    if (active !== undefined) {
      for (const member of active) {
        if (member.evaluationStatus === 'evaluating') {
          member.evaluationStatus = 'unevaluated';
        }
      }
    }
    this.clear(root);
  }

  /**
   * @param {SourceTextModuleRecord} root
   * @returns {void}
   */
  clear(root) {
    this.activeRecords.delete(root);
    this.completedBodies.delete(root);
  }
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {SourceTextModuleRecord}
 */
function requiredEvaluationSccRoot(record) {
  const root = record.evaluationSccRoot;

  if (!(root instanceof SourceTextModuleRecord)) {
    throw new TypeError('Module evaluation SCC is not initialized');
  }

  return root;
}

/**
 * @param {SourceTextModuleRecord} record
 * @returns {ReadonlyArray<SourceTextModuleRecord>}
 */
function requiredEvaluationSccMembers(record) {
  const members = record.evaluationSccMembers;

  if (members.length === 0) {
    throw new TypeError('Module evaluation SCC is not initialized');
  }

  return members;
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {unknown} value
 * @returns {void}
 */
function markModuleSccAbruptly(record, value) {
  for (const member of requiredEvaluationSccMembers(record)) {
    if (
      member.evaluationStatus === 'evaluated' ||
      member.evaluationStatus === 'errored'
    ) {
      continue;
    }

    member.evaluationCompletion = Object.freeze({ type: 'throw', value });
    member.evaluationStatus = 'errored';
  }
}

/**
 * @param {SourceTextModuleRecord} record
 * @param {unknown} value
 * @param {Set<SourceTextModuleRecord>} completed
 * @returns {void}
 */
function completeDeferredDependentsAbruptly(record, value, completed) {
  if (completed.has(record)) {
    return;
  }
  completed.add(record);

  const dependents = DEFERRED_EVALUATION_DEPENDENTS.get(record);
  DEFERRED_EVALUATION_DEPENDENTS.delete(record);

  if (dependents === undefined) {
    return;
  }

  for (const dependent of dependents) {
    markModuleSccAbruptly(dependent, value);
    for (const member of requiredEvaluationSccMembers(dependent)) {
      completeDeferredDependentsAbruptly(member, value, completed);
    }
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
      newTargetStatus: 'absent',
    }),
  };
}
