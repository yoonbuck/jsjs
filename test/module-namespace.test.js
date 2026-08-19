import { assertSame, assertThrows } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoaderError,
} from '../src/index.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { evaluateModuleGraph } from '../src/evaluator/modules.js';
import { linkModuleGraph } from '../src/runtime/module-linker.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import { EngineObject } from '../src/runtime/object.js';

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

export default [
  {
    name: 'loader returns one cached namespace with sorted exports',
    async run() {
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: 'export { z } from "dep"; export { a } from "dep";',
          dep: 'export let a = 1; export let z = 2;',
        },
        realm,
      );

      const namespace = await loader.loadAndEvaluate('root');
      const toStringTag = realm.agent.wellKnownSymbols.toStringTag;

      assertSame(namespace.getPrototype(), null);
      assertSame(namespace.isExtensible(), false);
      assertSame(namespace.agent, realm.agent);
      assertSame(
        namespace.ownPropertyKeys().map(String).join(','),
        'a,z,Symbol(Symbol.toStringTag)',
      );
      assertSame(namespace.get('a'), 1);
      assertSame(namespace.get(toStringTag), 'Module');
      assertSame(namespace.get(Symbol.toStringTag), undefined);
      assertSame(namespace, await loader.loadAndEvaluate('root'));
    },
  },
  {
    name: 'namespace export descriptors are live and reject mutation',
    async run() {
      const loader = loaderFor({
        root: 'export let value = 1; export function bump() { value += 1; }',
      });
      const namespace = await loader.loadAndEvaluate('root');
      const descriptor = namespace.getOwnProperty('value');

      if (descriptor === undefined) {
        throw new Error('Expected an exported value descriptor');
      }

      assertSame(descriptor.value, 1);
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, false);
      assertSame(namespace.put('value', 2), false);
      assertThrows(() => namespace.put('value', 2, true), GuestErrorSignal);
      assertSame(namespace.delete('value'), false);
      assertThrows(() => namespace.delete('value', true), GuestErrorSignal);
      assertSame(namespace.defineOwnProperty('value', { value: 1 }), true);
      assertSame(
        namespace.defineOwnProperty('value', {
          writable: true,
          enumerable: true,
          configurable: false,
        }),
        true,
      );
      assertSame(namespace.defineOwnProperty('value', { value: 2 }), false);
      assertThrows(
        () => namespace.defineOwnProperty('value', { value: 2 }, true),
        GuestErrorSignal,
      );

      namespace.get('bump').callFunction(undefined, []);
      assertSame(namespace.get('value'), 2);
      assertSame(namespace.getOwnProperty('value').value, 2);
    },
  },
  {
    name: 'namespace uses null-only prototype and compatible toStringTag descriptor',
    async run() {
      const realm = createRealm();
      const loader = loaderFor({ root: 'export const value = 1;' }, realm);
      const namespace = await loader.loadAndEvaluate('root');
      const toStringTag = realm.agent.wellKnownSymbols.toStringTag;
      const descriptor = namespace.getOwnProperty(toStringTag);

      if (descriptor === undefined) {
        throw new Error('Expected a toStringTag descriptor');
      }

      assertSame(namespace.setPrototypeOf(null), true);
      assertSame(namespace.setPrototypeOf(new EngineObject()), false);
      assertSame(descriptor.value, 'Module');
      assertSame(descriptor.writable, false);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, false);
      assertSame(
        namespace.defineOwnProperty(toStringTag, {
          value: 'Module',
          writable: false,
          enumerable: false,
          configurable: false,
        }),
        true,
      );
      assertSame(
        namespace.defineOwnProperty(toStringTag, { value: 'Not Module' }),
        false,
      );
      assertSame(
        namespace.defineOwnProperty('added', {
          value: 1,
          writable: true,
          enumerable: true,
          configurable: true,
        }),
        false,
      );
    },
  },
  {
    name: 'namespace preserves a linked export TDZ until evaluation',
    async run() {
      const loader = loaderFor({ root: 'export let value = 1;' });
      const record = await loadModuleGraph(loader, 'root');

      linkModuleGraph(record);
      const namespace = record.getNamespace();
      const inheritor = new EngineObject(
        namespace,
        'Object',
        record.realm.agent,
      );

      assertSame(namespace.hasProperty('value'), true);
      assertSame(namespace.hasProperty('missing'), false);
      assertSame(inheritor.hasProperty('value'), true);
      assertThrows(() => namespace.get('value'), GuestErrorSignal);
      evaluateModuleGraph(record);
      assertSame(namespace.get('value'), 1);
    },
  },
  {
    name: 'namespace imports and reexports preserve target namespace identity',
    async run() {
      const loader = loaderFor({
        entry:
          'import * as ns from "dep"; import * as same from "dep"; export { ns, same };',
        reexport: 'import { ns } from "entry"; export { ns as forwarded };',
        dep: 'export const value = 1;',
      });

      const entry = await loader.loadAndEvaluate('entry');
      const reexport = await loader.loadAndEvaluate('reexport');
      const dependency = await loader.loadAndEvaluate('dep');

      assertSame(entry.get('ns'), dependency);
      assertSame(entry.get('same'), dependency);
      assertSame(entry.get('ns'), entry.get('ns'));
      assertSame(reexport.get('forwarded'), dependency);
      assertSame(entry, await loader.loadAndEvaluate('entry'));
      assertSame(reexport, await loader.loadAndEvaluate('reexport'));
    },
  },
  {
    name: 'namespace omits namespace-import local exports that are ambiguous across intermediaries',
    async run() {
      const loader = loaderFor({
        root: 'export * from "left"; export * from "right";',
        left: 'import * as ns from "dep"; export { ns };',
        right: 'import * as ns from "dep"; export { ns };',
        dep: 'export const value = 1;',
      });

      const root = await loader.loadAndEvaluate('root');
      const left = await loader.loadAndEvaluate('left');
      const right = await loader.loadAndEvaluate('right');
      const dependency = await loader.loadAndEvaluate('dep');

      assertSame(root.hasProperty('ns'), false);
      assertSame(root.getOwnProperty('ns'), undefined);
      assertSame(root.get('ns'), undefined);
      assertSame(left.get('ns'), dependency);
      assertSame(right.get('ns'), dependency);
      assertSame(dependency, await loader.loadAndEvaluate('dep'));
    },
  },
  {
    name: 'namespace omits ambiguous star exports',
    async run() {
      const loader = loaderFor({
        root: 'export * from "left"; export * from "right";',
        left: 'export const leftOnly = 1; export const shared = 2;',
        right: 'export const rightOnly = 3; export const shared = 4;',
      });
      const namespace = await loader.loadAndEvaluate('root');
      const keys = /** @type {(string | symbol)[]} */ (
        namespace.ownPropertyKeys()
      )
        .filter((key) => typeof key === 'string')
        .join(',');

      assertSame(keys, 'leftOnly,rightOnly');
      assertSame(namespace.getOwnProperty('shared'), undefined);
      assertSame(namespace.get('shared'), undefined);
    },
  },
  {
    name: 'namespace creation rejects a not-found exported name with a Realm-owned SyntaxError while named imports still fail during linking',
    async run() {
      const realm = createRealm();
      const cycle = {
        root: 'export * from "A";',
        A: 'export * from "D";',
        D: 'export { y as x } from "A"; export const y = 1;',
      };
      const cycleLoader = loaderFor(cycle, realm);
      const namespaceError = await rejected(
        cycleLoader.loadAndEvaluate('root'),
      );
      const repeatedNamespaceError = await rejected(
        cycleLoader.loadAndEvaluate('root'),
      );

      assertSame(namespaceError instanceof ModuleLoaderError, true);
      assertSame(namespaceError.phase, 'evaluate');
      assertSame(namespaceError.identifier, 'root');
      assertSame(namespaceError.cause, undefined);
      assertSame(
        namespaceError.value.getPrototype(),
        realm.intrinsics.syntaxErrorPrototype,
      );
      assertSame(namespaceError.value.get('name'), 'SyntaxError');
      assertSame(repeatedNamespaceError, namespaceError);
      assertSame(repeatedNamespaceError.value, namespaceError.value);

      const importError = await rejected(
        loaderFor(
          {
            entry: 'import { x } from "root";',
            ...cycle,
          },
          realm,
        ).loadAndEvaluate('entry'),
      );

      assertSame(importError instanceof ModuleLoaderError, true);
      assertSame(importError.phase, 'link');
      assertSame(importError.identifier, 'entry');
      assertSame(importError.value, undefined);
      assertSame(
        importError.cause.getPrototype(),
        realm.intrinsics.syntaxErrorPrototype,
      );
      assertSame(importError.cause.get('name'), 'SyntaxError');
    },
  },
  {
    name: 'unused namespace imports instantiate before evaluation and cache their public link failure',
    async run() {
      const realm = createRealm();
      const sources = {
        entry: 'import * as ns from "A"; export const reached = true;',
        A: 'export * from "D";',
        D: 'export { y as x } from "A"; export const y = 1;',
      };
      const loader = loaderFor(sources, realm);
      const first = await rejected(loader.loadAndEvaluate('entry'));
      const second = await rejected(loader.loadAndEvaluate('entry'));
      const concurrentLoader = loaderFor(sources, realm);
      const [concurrentFirst, concurrentSecond] = await Promise.all([
        rejected(concurrentLoader.loadAndEvaluate('entry')),
        rejected(concurrentLoader.loadAndEvaluate('entry')),
      ]);

      assertSame(first instanceof ModuleLoaderError, true);
      assertSame(first.phase, 'link');
      assertSame(first.identifier, 'entry');
      assertSame(first.value, undefined);
      assertSame(
        first.cause.getPrototype(),
        realm.intrinsics.syntaxErrorPrototype,
      );
      assertSame(first.cause.get('name'), 'SyntaxError');
      assertSame(second, first);
      assertSame(second.cause, first.cause);
      assertSame(concurrentFirst, concurrentSecond);
      assertSame(concurrentFirst.cause, concurrentSecond.cause);
    },
  },
  {
    name: 'failed namespace instantiation rolls back namespaces materialized earlier in the link transaction',
    async run() {
      const loader = loaderFor({
        entry: 'import * as valid from "valid"; import * as invalid from "A";',
        valid: 'export const value = 1;',
        A: 'export * from "D";',
        D: 'export { y as x } from "A"; export const y = 1;',
      });
      const entry = await loadModuleGraph(loader, 'entry');
      const valid = entry.resolvedRequestedModules[0].module;

      const error = await rejected(loader.loadAndEvaluate('entry'));

      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error.phase, 'link');
      assertSame(valid.status, 'unlinked');
      assertThrows(() => valid.getNamespace(), TypeError);
      const validNamespace = await loader.loadAndEvaluate('valid');
      assertSame(validNamespace.get('value'), 1);
    },
  },
  {
    name: 'used namespace import failures occur before guest code can catch them',
    async run() {
      const realm = createRealm();
      realm.globalObject.defineOwnProperty('bodyRuns', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const loader = loaderFor(
        {
          entry:
            'import * as ns from "A"; try { ns.x; } catch (error) { bodyRuns += 1; }',
          A: 'export * from "D";',
          D: 'export { y as x } from "A"; export const y = 1;',
        },
        realm,
      );
      const error = await rejected(loader.loadAndEvaluate('entry'));

      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error.phase, 'link');
      assertSame(error.identifier, 'entry');
      assertSame(
        error.cause.getPrototype(),
        realm.intrinsics.syntaxErrorPrototype,
      );
      assertSame(error.cause.get('name'), 'SyntaxError');
      assertSame(realm.globalObject.get('bodyRuns'), 0);
    },
  },
  {
    name: 'cyclic namespace imports instantiate after their complete SCC is linked',
    async run() {
      const loader = loaderFor({
        a: 'import * as b from "b"; export const value = "a"; export function readB() { return b.value; }',
        b: 'import * as a from "a"; export const value = "b"; export function readA() { return a.value; }',
      });

      const a = await loader.loadAndEvaluate('a');
      const b = await loader.loadAndEvaluate('b');

      assertSame(a.get('readB').callFunction(undefined, []), 'b');
      assertSame(b.get('readA').callFunction(undefined, []), 'a');
      assertSame(await loader.loadAndEvaluate('a'), a);
      assertSame(await loader.loadAndEvaluate('b'), b);
    },
  },
  {
    name: 'namespace set rejects direct and receiver-aware assignment for exports and new keys',
    async run() {
      const loader = loaderFor({ root: 'export let value = 1;' });
      const namespace = await loader.loadAndEvaluate('root');
      const child = new EngineObject(namespace);

      assertSame(namespace.set('value', 2, namespace), false);
      assertSame(namespace.set('value', 2, child), false);
      assertSame(namespace.set('extra', 2, namespace), false);
      assertSame(namespace.set('extra', 2, child), false);
      assertThrows(
        () => namespace.set('value', 2, namespace, true),
        GuestErrorSignal,
      );
      assertThrows(
        () => namespace.set('value', 2, child, true),
        GuestErrorSignal,
      );
      assertThrows(
        () => namespace.set('extra', 2, namespace, true),
        GuestErrorSignal,
      );
      assertThrows(
        () => namespace.set('extra', 2, child, true),
        GuestErrorSignal,
      );

      assertSame(namespace.get('value'), 1);
      assertSame(namespace.getOwnProperty('extra'), undefined);
      assertSame(child.getOwnProperty('value'), undefined);
      assertSame(child.getOwnProperty('extra'), undefined);
    },
  },
  {
    name: 'assigning a property through an EngineObject whose prototype is a namespace produces a Realm-correct guest TypeError and creates no own property',
    async run() {
      const realm = createRealm();
      const namespaceLoader = loaderFor(
        { root: 'export const value = 1;' },
        realm,
      );
      const namespace = await namespaceLoader.loadAndEvaluate('root');
      const child = new EngineObject(namespace);

      realm.globalObject.defineOwnProperty('child', {
        value: child,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const assignmentLoader = loaderFor({ assign: 'child.extra = 2;' }, realm);
      const error = await rejected(assignmentLoader.loadAndEvaluate('assign'));

      assertSame(error.phase, 'evaluate');
      assertSame(
        error.value.getPrototype(),
        realm.intrinsics.typeErrorPrototype,
      );
      assertSame(error.value.get('name'), 'TypeError');
      assertSame(child.getOwnProperty('extra'), undefined);
      assertSame(namespace.getOwnProperty('extra'), undefined);
    },
  },
];
