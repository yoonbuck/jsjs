import { assertSame, assertThrows } from './harness/assert.js';
import { createModuleLoader, createRealm } from '../src/index.js';
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

      assertThrows(() => namespace.get('value'), GuestErrorSignal);
      evaluateModuleGraph(record);
      assertSame(namespace.get('value'), 1);
    },
  },
  {
    name: 'namespace imports and reexports preserve target namespace identity',
    async run() {
      const loader = loaderFor({
        entry: 'import * as ns from "dep"; export { ns };',
        reexport: 'import { ns } from "entry"; export { ns as forwarded };',
        dep: 'export const value = 1;',
      });

      const entry = await loader.loadAndEvaluate('entry');
      const reexport = await loader.loadAndEvaluate('reexport');
      const dependency = await loader.loadAndEvaluate('dep');

      assertSame(entry.get('ns'), dependency);
      assertSame(reexport.get('forwarded'), dependency);
      assertSame(entry, await loader.loadAndEvaluate('entry'));
      assertSame(reexport, await loader.loadAndEvaluate('reexport'));
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
];
