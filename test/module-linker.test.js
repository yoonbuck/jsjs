import { assertSame, assertThrows } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoaderError,
} from '../src/index.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import { SourceTextModuleRecord } from '../src/runtime/module-record.js';
import {
  linkModuleGraph,
  resolveExport,
} from '../src/runtime/module-linker.js';
import { parseModule } from '../src/parser.js';

/**
 * @param {Record<string, string>} sources
 * @param {import('../src/runtime/realm.js').Realm} [realm]
 * @returns {import('../src/runtime/module-loader.js').ModuleLoader}
 */
function loaderFor(sources, realm = createRealm()) {
  return createModuleLoader(realm, {
    resolve(specifier) {
      return specifier;
    },
    load(identifier) {
      return sources[identifier];
    },
  });
}

/**
 * @param {import('../src/runtime/module-record.js').SourceTextModuleRecord} record
 * @param {string} specifier
 * @returns {import('../src/runtime/module-record.js').SourceTextModuleRecord}
 */
function requestedModule(record, specifier) {
  const edge = record.resolvedRequestedModules.find(
    (candidate) => candidate.specifier === specifier,
  );

  if (edge === undefined) {
    throw new Error(`Expected resolved ${specifier} request`);
  }

  return edge.module;
}

/**
 * @param {import('../src/runtime/module-record.js').SourceTextModuleRecord} record
 * @returns {void}
 */
function assertUnlinked(record) {
  assertSame(record.environment, null);
  assertSame(record.status, 'unlinked');
  assertSame(record.dfsIndex, undefined);
  assertSame(record.dfsAncestorIndex, undefined);
  assertSame(record.dfsOnStack, false);
  assertSame(record.resolvedImportEntries.length, 0);
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<any>}
 */
async function rejected(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected promise to reject');
}

/**
 * Keeps a source-cycle acquisition observable in runners that do not expose
 * timers: graph loading is host-Promise orchestration only and must settle in a
 * bounded number of microtask turns.
 *
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
async function resolvesPromptly(promise) {
  let settled = false;
  /** @type {T | undefined} */
  let value;
  /** @type {unknown} */
  let failure;
  promise.then(
    (result) => {
      settled = true;
      value = result;
    },
    (error) => {
      settled = true;
      failure = error;
    },
  );

  for (let turn = 0; turn < 100 && !settled; turn += 1) {
    await Promise.resolve();
  }

  if (!settled) {
    throw new Error('Expected cyclic source graph loading to settle');
  }
  if (failure !== undefined) {
    throw failure;
  }

  return /** @type {T} */ (value);
}

export default [
  {
    name: 'explicit export wins over star ambiguity and star excludes default',
    async run() {
      const loader = loaderFor({
        root: 'export { x } from "a"; export * from "a"; export * from "b";',
        a: 'export const x = 1; export default 2;',
        b: 'export const x = 3; export const y = 4;',
      });
      const root = await loadModuleGraph(loader, 'root', null);
      linkModuleGraph(root);

      const x = resolveExport(root, 'x', new Set());
      const y = resolveExport(root, 'y', new Set());
      assertSame(x.type, 'resolved');
      if (x.type !== 'resolved') {
        throw new Error('Expected x to resolve');
      }
      assertSame(x.bindingName, 'x');
      assertSame(x.module, requestedModule(root, 'a'));
      assertSame(y.type, 'resolved');
      if (y.type !== 'resolved') {
        throw new Error('Expected y to resolve');
      }
      assertSame(y.bindingName, 'y');
      assertSame(resolveExport(root, 'default', new Set()).type, 'not-found');
    },
  },
  {
    name: 'linking instantiates module bindings without evaluating lexical declarations',
    async run() {
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: 'import { imported } from "dep"; import * as ns from "dep"; export var value; export function declared() {} export let lexical; export const constant = 1; export class Klass {} export default function () {}',
          dep: 'export function imported() {}',
        },
        realm,
      );
      const root = await loadModuleGraph(loader, 'root');
      const dependency = requestedModule(root, 'dep');
      linkModuleGraph(root);

      assertSame(root.environment.outer, realm.globalEnvironment);
      assertSame(realm.globalObject.hasProperty('value'), false);
      assertSame(root.environment.getBindingValue('value', true), undefined);
      assertSame(
        root.environment.getBindingValue('imported', true),
        dependency.environment.getBindingValue('imported', true),
      );
      assertSame(root.environment.hasBinding('ns'), true);
      assertSame(
        root.environment.getBindingValue('declared', true).get('name'),
        'declared',
      );
      assertSame(
        root.environment.getBindingValue('*default*', true).get('name'),
        'default',
      );
      assertThrows(
        () => root.environment.getBindingValue('lexical', true),
        GuestErrorSignal,
      );
      assertThrows(
        () => root.environment.getBindingValue('constant', true),
        GuestErrorSignal,
      );
      assertThrows(
        () => root.environment.getBindingValue('Klass', true),
        GuestErrorSignal,
      );
      assertThrows(
        () => root.environment.setMutableBinding('imported', 1, false),
        GuestErrorSignal,
      );
      dependency.environment.setMutableBinding('imported', 'updated', true);
      assertSame(root.environment.getBindingValue('imported', true), 'updated');
    },
  },
  {
    name: 'anonymous default classes and default expressions remain in the module TDZ',
    async run() {
      for (const source of ['export default class {}', 'export default 1;']) {
        const root = await loadModuleGraph(loaderFor({ root: source }), 'root');
        linkModuleGraph(root);
        assertThrows(
          () => root.environment.getBindingValue('*default*', true),
          GuestErrorSignal,
        );
      }
    },
  },
  {
    name: 'imports use each source-order resolved request occurrence',
    async run() {
      let dependencyResolutions = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          if (specifier === 'root') {
            return 'root';
          }
          dependencyResolutions += 1;
          return `dep-${dependencyResolutions}`;
        },
        load(identifier) {
          return identifier === 'root'
            ? 'import { value as first } from "dep"; import { value as second } from "dep";'
            : 'export function value() {}';
        },
      });
      const root = await loadModuleGraph(loader, 'root');
      const firstDependency = root.resolvedRequestedModules[0].module;
      const secondDependency = root.resolvedRequestedModules[1].module;
      linkModuleGraph(root);

      firstDependency.environment.setMutableBinding('value', 'first', true);
      secondDependency.environment.setMutableBinding('value', 'second', true);
      assertSame(root.environment.getBindingValue('first', true), 'first');
      assertSame(root.environment.getBindingValue('second', true), 'second');
    },
  },
  {
    name: 'mixed imported and direct re-exports keep their exact request entries',
    async run() {
      const loader = loaderFor({
        root: 'import { x } from "a"; export { x }; export { y } from "b";',
        a: 'export const x = 1;',
        b: 'export const y = 2;',
      });

      const namespace = await loader.loadAndEvaluate('root');

      assertSame(namespace.get('x'), 1);
      assertSame(namespace.get('y'), 2);
    },
  },
  {
    name: 'mixed re-exports preserve duplicate specifier request ordering',
    async run() {
      let dependencyResolutions = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          if (specifier === 'root') {
            return 'root';
          }
          dependencyResolutions += 1;
          return `dep-${dependencyResolutions}`;
        },
        load(identifier) {
          if (identifier === 'root') {
            return 'import { value as x } from "dep"; export { x }; export { value as y } from "dep";';
          }
          return `export const value = "${identifier}";`;
        },
      });

      const namespace = await loader.loadAndEvaluate('root');

      assertSame(namespace.get('x'), 'dep-1');
      assertSame(namespace.get('y'), 'dep-2');
    },
  },
  {
    name: 'linking creates live cycle imports and pair-identity export resolution terminates',
    async run() {
      const loader = loaderFor({
        a: 'import { b } from "b"; export function a() {} export * from "b";',
        b: 'import { a } from "a"; export function b() {} export * from "a";',
      });
      const a = await resolvesPromptly(loadModuleGraph(loader, 'a'));
      const b = requestedModule(a, 'b');
      linkModuleGraph(a);

      assertSame(a.status, 'linked');
      assertSame(b.status, 'linked');
      assertSame(
        a.environment.getBindingValue('b', true),
        b.environment.getBindingValue('b', true),
      );
      assertSame(
        b.environment.getBindingValue('a', true),
        a.environment.getBindingValue('a', true),
      );
      b.environment.setMutableBinding('b', 'updated', true);
      assertSame(a.environment.getBindingValue('b', true), 'updated');
      assertSame(resolveExport(a, 'missing', new Set()).type, 'not-found');
    },
  },
  {
    name: 'ResolveExport pairs distinguish record identity from matching identifiers',
    run() {
      const realm = createRealm();
      const first = new SourceTextModuleRecord({
        realm,
        identifier: 'same',
        ast: parseModule('export * from "second";'),
      });
      const second = new SourceTextModuleRecord({
        realm,
        identifier: 'same',
        ast: parseModule('export * from "third";'),
      });
      const third = new SourceTextModuleRecord({
        realm,
        identifier: 'third',
        ast: parseModule('export const value = 1;'),
      });
      first.resolvedRequestedModules = Object.freeze([
        Object.freeze({
          specifier: 'second',
          identifier: 'same',
          module: second,
        }),
      ]);
      second.resolvedRequestedModules = Object.freeze([
        Object.freeze({
          specifier: 'third',
          identifier: 'third',
          module: third,
        }),
      ]);

      const resolution = resolveExport(first, 'value', new Set());
      assertSame(resolution.type, 'resolved');
      if (resolution.type !== 'resolved') {
        throw new Error(
          'Expected value to resolve through both same-id records',
        );
      }
      assertSame(resolution.module, third);
      assertSame(resolution.bindingName, 'value');
    },
  },
  {
    name: 'ambiguous star exports stay absent until a named import requests them',
    async run() {
      const root = await loadModuleGraph(
        loaderFor({
          root: 'export * from "a"; export * from "b";',
          a: 'export const shared = 1;',
          b: 'export const shared = 2;',
        }),
        'root',
      );
      linkModuleGraph(root);

      assertSame(resolveExport(root, 'shared', new Set()).type, 'ambiguous');
    },
  },
  {
    name: 'ambiguous star exports reject a named import with a guest SyntaxError',
    async run() {
      const root = await loadModuleGraph(
        loaderFor({
          root: 'import { shared } from "barrel";',
          barrel: 'export * from "a"; export * from "b";',
          a: 'export const shared = 1;',
          b: 'export const shared = 2;',
        }),
        'root',
      );
      const error = /** @type {ModuleLoaderError} */ (
        assertThrows(() => linkModuleGraph(root), ModuleLoaderError)
      );

      assertSame(error.phase, 'link');
      assertSame(
        /** @type {{ get: (name: string) => unknown }} */ (error.cause).get(
          'name',
        ),
        'SyntaxError',
      );
      assertUnlinked(root);
    },
  },
  {
    name: 'namespace-import local exports from separate intermediaries make a named import ambiguous',
    async run() {
      const root = await loadModuleGraph(
        loaderFor({
          root: 'import { ns } from "barrel";',
          barrel: 'export * from "left"; export * from "right";',
          left: 'import * as ns from "dep"; export { ns };',
          right: 'import * as ns from "dep"; export { ns };',
          dep: 'export const value = 1;',
        }),
        'root',
      );
      const error = /** @type {ModuleLoaderError} */ (
        assertThrows(() => linkModuleGraph(root), ModuleLoaderError)
      );

      assertSame(error.phase, 'link');
      assertSame(
        /** @type {{ get: (name: string) => unknown }} */ (error.cause).get(
          'name',
        ),
        'SyntaxError',
      );
      assertUnlinked(root);
    },
  },
  {
    name: 'failed link rolls back every graph record without reloading parsed source',
    async run() {
      let loads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          loads += 1;
          return identifier === 'root'
            ? 'import { missing } from "dep"; export { missing };'
            : 'export const present = 1;';
        },
      });
      const root = await loadModuleGraph(loader, 'root', null);
      const dependency = requestedModule(root, 'dep');
      const first = /** @type {ModuleLoaderError} */ (
        assertThrows(() => linkModuleGraph(root), ModuleLoaderError)
      );

      assertSame(first.phase, 'link');
      assertSame(first.identifier, 'root');
      assertSame(
        /** @type {{ get: (name: string) => unknown }} */ (first.cause).get(
          'name',
        ),
        'SyntaxError',
      );
      assertUnlinked(root);
      assertUnlinked(dependency);

      const second = /** @type {ModuleLoaderError} */ (
        assertThrows(() => linkModuleGraph(root), ModuleLoaderError)
      );
      assertSame(second.phase, 'link');
      assertUnlinked(root);
      assertUnlinked(dependency);
      assertSame(loads, 2);
    },
  },
  {
    name: 'failed descendant linking clears already-linked tentative dependencies',
    async run() {
      const loader = loaderFor({
        root: 'import { good } from "good"; import "bad"; export { good };',
        good: 'export function good() {}',
        bad: 'import { missing } from "dep";',
        dep: 'export const present = 1;',
      });
      const root = await loadModuleGraph(loader, 'root');
      const good = requestedModule(root, 'good');
      const bad = requestedModule(root, 'bad');

      assertThrows(() => linkModuleGraph(root), ModuleLoaderError);
      assertUnlinked(root);
      assertUnlinked(good);
      assertUnlinked(bad);
      assertSame(
        root.resolvedRequestedModules[0].module,
        good,
        'parsed graph edge remains cached after rollback',
      );
    },
  },
  {
    name: 'loader link failures retain the Realm-owned syntax error cause',
    async run() {
      const loader = loaderFor({
        root: 'export { missing } from "dep";',
        dep: 'export const present = 1;',
      });

      const error = await rejected(loader.loadAndEvaluate('root'));
      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error.phase, 'link');
      assertSame(error.identifier, 'root');
      assertSame(error.cause.get('name'), 'SyntaxError');
    },
  },
];
