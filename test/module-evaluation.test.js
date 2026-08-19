import { assertSame } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoaderError,
} from '../src/index.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import { linkModuleGraph } from '../src/runtime/module-linker.js';
import { evaluateModuleGraph } from '../src/evaluator/modules.js';

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
    name: 'modules are strict, module scoped, live, and evaluate once',
    async run() {
      const realm = createRealm();
      const sources = {
        root: 'import { bump, value } from "a"; bump(); export { value }; export const top = this;',
        a: 'export let value = 0; export function bump() { value += 1; }',
      };
      const loader = loaderFor(sources, realm);
      const root = await loadModuleGraph(loader, 'root', null);
      linkModuleGraph(root);

      const first = evaluateModuleGraph(root);
      const second = evaluateModuleGraph(root);

      assertSame(first, root);
      assertSame(first, second);
      assertSame(root.environment.getBindingValue('value', true), 1);
      assertSame(root.environment.getBindingValue('top', true), undefined);
      assertSame(realm.globalObject.hasProperty('value'), false);
    },
  },
  {
    name: 'public module evaluation returns one cached namespace after synchronous evaluation',
    async run() {
      const loader = loaderFor({
        root: 'import { value } from "dep"; export const result = value;',
        dep: 'export const value = 42;',
      });

      const first = await loader.loadAndEvaluate('root');

      assertSame(first.get('result'), 42);
      assertSame(await loader.loadAndEvaluate('root'), first);
    },
  },
  {
    name: 'deep dependency evaluation stays off the host stack and executes once',
    async run() {
      const realm = createRealm();
      realm.globalObject.defineOwnProperty('marks', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const depth = 4000;
      /** @type {Record<string, string>} */
      const sources = {
        [`module-${depth}`]:
          'marks += 1; function recurse() { recurse(); } try { recurse(); } catch (error) {}',
      };

      for (let index = depth - 1; index >= 0; index -= 1) {
        sources[`module-${index}`] =
          `import "module-${index + 1}"; export const root = ${index === 0};`;
      }

      const loader = loaderFor(sources, realm);
      const first = await loader.loadAndEvaluate('module-0');

      assertSame(first.get('root'), true);
      assertSame(realm.globalObject.get('marks'), 1);
      assertSame(await loader.loadAndEvaluate('module-0'), first);
      assertSame(realm.globalObject.get('marks'), 1);
    },
  },
  {
    name: 'top-level module var functions and classes do not become global properties',
    async run() {
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: 'var localVar = 1; function localFunction() {} class LocalClass {} export { localVar, localFunction, LocalClass };',
        },
        realm,
      );
      const root = await loadModuleGraph(loader, 'root');
      linkModuleGraph(root);
      evaluateModuleGraph(root);

      assertSame(root.environment.getBindingValue('localVar', true), 1);
      assertSame(
        root.environment.getBindingValue('localFunction', true).get('name'),
        'localFunction',
      );
      assertSame(
        root.environment.getBindingValue('LocalClass', true).get('name'),
        'LocalClass',
      );
      assertSame(realm.globalObject.hasProperty('localVar'), false);
      assertSame(realm.globalObject.hasProperty('localFunction'), false);
      assertSame(realm.globalObject.hasProperty('LocalClass'), false);
    },
  },
  {
    name: 'module direct eval is strict and cannot leak declarations',
    async run() {
      const root = await loadModuleGraph(
        loaderFor({
          root: 'eval("var fromEval = 1; function fromEvalFunction() {}"); export const result = typeof fromEval + ":" + typeof fromEvalFunction;',
        }),
        'root',
      );
      linkModuleGraph(root);
      evaluateModuleGraph(root);

      assertSame(
        root.environment.getBindingValue('result', true),
        'undefined:undefined',
      );
    },
  },
  {
    name: 'assignment to an imported binding is an evaluation TypeError',
    async run() {
      const loader = loaderFor({
        root: 'import { value } from "dep"; value = 2;',
        dep: 'export let value = 1;',
      });

      const error = await rejected(loader.loadAndEvaluate('root'));

      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error.phase, 'evaluate');
      assertSame(error.value.get('name'), 'TypeError');
    },
  },
  {
    name: 'an imported lexical binding preserves its TDZ during evaluation',
    async run() {
      const loader = loaderFor({
        root: 'import { dependent } from "dep"; export let rootValue = 1; export { dependent };',
        dep: 'import { rootValue } from "root"; export const dependent = rootValue;',
      });

      const error = await rejected(loader.loadAndEvaluate('root'));

      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error.phase, 'evaluate');
      assertSame(error.value.get('name'), 'ReferenceError');
    },
  },
  {
    name: 'mutually recursive exported functions evaluate from their linked bindings',
    async run() {
      const root = await loadModuleGraph(
        loaderFor({
          root: 'import { b } from "dep"; export function a(n) { return n === 0 ? 0 : b(n - 1) + 1; } export const result = a(3);',
          dep: 'import { a } from "root"; export function b(n) { return n === 0 ? 0 : a(n - 1) + 1; }',
        }),
        'root',
      );
      linkModuleGraph(root);
      evaluateModuleGraph(root);

      assertSame(root.environment.getBindingValue('result', true), 3);
    },
  },
  {
    name: 'anonymous default declarations and expressions initialize default once with its inferred name',
    async run() {
      const cases = [
        {
          source: 'export default function () {}',
          initializedDuringLink: true,
        },
        {
          source: 'export default class {}',
          initializedDuringLink: false,
        },
        {
          source: 'export default (function () {});',
          initializedDuringLink: false,
        },
        {
          source: 'export default (class {});',
          initializedDuringLink: false,
        },
      ];

      for (const testCase of cases) {
        const root = await loadModuleGraph(
          loaderFor({ root: testCase.source }),
          'root',
        );
        linkModuleGraph(root);
        const before = testCase.initializedDuringLink
          ? root.environment.getBindingValue('*default*', true)
          : undefined;

        evaluateModuleGraph(root);

        const value = root.environment.getBindingValue('*default*', true);
        assertSame(value.get('name'), 'default');
        if (testCase.initializedDuringLink) {
          assertSame(value, before);
        }
      }

      const expressionRoot = await loadModuleGraph(
        loaderFor({ root: 'export default 42;' }),
        'root',
      );
      linkModuleGraph(expressionRoot);
      evaluateModuleGraph(expressionRoot);
      assertSame(
        expressionRoot.environment.getBindingValue('*default*', true),
        42,
      );
    },
  },
  {
    name: 'evaluation rejection preserves one exact guest value',
    async run() {
      const thrown = {};
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: 'import "dep"; throw marker;',
          dep: 'runs += 1;',
        },
        realm,
      );
      realm.globalObject.defineOwnProperty('marker', {
        value: thrown,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('runs', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const first = await rejected(loader.loadAndEvaluate('root'));
      const second = await rejected(loader.loadAndEvaluate('root'));

      assertSame(first, second);
      assertSame(first.phase, 'evaluate');
      assertSame(first.value, thrown);
      assertSame(realm.globalObject.get('runs'), 1);
    },
  },
  {
    name: 'native evaluation failures cannot spoof ModuleLoaderError provenance',
    async run() {
      const realm = createRealm();
      const spoofed = new ModuleLoaderError({
        phase: 'resolve',
        identifier: 'spoofed',
        cause: 'spoofed cause',
      });
      realm.globalObject.defineOwnProperty('trigger', {
        value: realm.createNativeFunction({
          name: 'trigger',
          length: 0,
          call() {
            throw spoofed;
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const loader = loaderFor({ root: 'trigger();' }, realm);

      const error = await rejected(loader.loadAndEvaluate('root'));

      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error === spoofed, false);
      assertSame(error.phase, 'evaluate');
      assertSame(error.identifier, 'root');
      assertSame(error.cause, spoofed);
    },
  },
  {
    name: 'an abrupt SCC evaluation marks every member with the exact guest value',
    async run() {
      const thrown = {};
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: 'import "dep"; throw marker;',
          dep: 'import "root"; runs += 1;',
        },
        realm,
      );
      realm.globalObject.defineOwnProperty('marker', {
        value: thrown,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('runs', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const rootError = await rejected(loader.loadAndEvaluate('root'));
      const dependencyError = await rejected(loader.loadAndEvaluate('dep'));

      assertSame(rootError.value, thrown);
      assertSame(dependencyError.phase, 'evaluate');
      assertSame(dependencyError.value, thrown);
      assertSame(realm.globalObject.get('runs'), 1);
    },
  },
  {
    name: 'abrupt module cycles complete each SCC in bounded work',
    async run() {
      const size = 64;
      /** @type {Record<string, string>} */
      const sources = {};
      for (let index = 0; index < size; index += 1) {
        const next = (index + 1) % size;
        sources[`module-${index}`] =
          `import "module-${next}";${index === size - 1 ? ' throw 1;' : ''}`;
      }

      const root = await loadModuleGraph(loaderFor(sources), 'module-0');
      linkModuleGraph(root);
      const add = Set.prototype.add;
      let addCalls = 0;
      /** @type {unknown} */
      let evaluationError;

      Set.prototype.add = function countedAdd(/** @type {unknown} */ value) {
        addCalls += 1;
        return add.call(this, value);
      };
      try {
        evaluateModuleGraph(root);
      } catch (error) {
        evaluationError = error;
      } finally {
        Set.prototype.add = add;
      }

      assertSame(evaluationError === undefined, false);
      if (addCalls >= 1000) {
        throw new Error(
          `Expected fewer than 1000 Set additions, got ${addCalls}`,
        );
      }
    },
  },
  {
    name: 'reentrant evaluation cannot commit a dependent before its active dependency',
    async run() {
      const thrown = {};
      const realm = createRealm();
      const loader = loaderFor(
        {
          a: 'trigger(); throw marker;',
          c: 'import "a"; runs += 1;',
        },
        realm,
      );
      const a = await loadModuleGraph(loader, 'a');
      const c = await loadModuleGraph(loader, 'c');
      linkModuleGraph(a);
      linkModuleGraph(c);
      realm.globalObject.defineOwnProperty('marker', {
        value: thrown,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('runs', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('trigger', {
        value: realm.createNativeFunction({
          name: 'trigger',
          length: 0,
          call() {
            evaluateModuleGraph(c);
            return undefined;
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const aError = await rejected(loader.loadAndEvaluate('a'));
      assertSame(c.evaluationStatus, 'errored');
      const cError = await rejected(loader.loadAndEvaluate('c'));

      assertSame(aError.value, thrown);
      assertSame(cError.phase, 'evaluate');
      assertSame(cError.value, thrown);
      assertSame(realm.globalObject.get('runs'), 0);
    },
  },
  {
    name: 'an abrupt SCC member caches failure before later members execute',
    async run() {
      const thrown = {};
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: 'import "first"; import "last";',
          first: 'import "root"; throw marker;',
          last: 'import "root"; runs += 1;',
        },
        realm,
      );
      realm.globalObject.defineOwnProperty('marker', {
        value: thrown,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('runs', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const rootError = await rejected(loader.loadAndEvaluate('root'));
      const last = await loadModuleGraph(loader, 'last');

      assertSame(rootError.value, thrown);
      assertSame(last.evaluationStatus, 'errored');
      assertSame(realm.globalObject.get('runs'), 0);
    },
  },
  {
    name: 'deferred reentrant SCC members retain completed bodies',
    async run() {
      const realm = createRealm();
      const loader = loaderFor(
        {
          a: 'trigger();',
          c: 'import "x"; import "a";',
          x: 'import "c"; runs += 1;',
        },
        realm,
      );
      const a = await loadModuleGraph(loader, 'a');
      const c = await loadModuleGraph(loader, 'c');
      linkModuleGraph(a);
      linkModuleGraph(c);
      realm.globalObject.defineOwnProperty('runs', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('trigger', {
        value: realm.createNativeFunction({
          name: 'trigger',
          length: 0,
          call() {
            evaluateModuleGraph(c);
            return undefined;
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const aNamespace = await loader.loadAndEvaluate('a');
      assertSame(realm.globalObject.get('runs'), 1);
      assertSame(await loader.loadAndEvaluate('a'), aNamespace);
      const cNamespace = await loader.loadAndEvaluate('c');
      assertSame(realm.globalObject.get('runs'), 1);
      assertSame(await loader.loadAndEvaluate('c'), cNamespace);
    },
  },
  {
    name: 'a deferred error does not overwrite an earlier abrupt completion',
    async run() {
      const markerA = {};
      const markerD = {};
      const realm = createRealm();
      const loader = loaderFor(
        {
          a: 'trigger(); throw markerA;',
          c: 'import "a"; import "d";',
          d: 'import "e"; import "c";',
          e: 'throw markerD;',
        },
        realm,
      );
      const a = await loadModuleGraph(loader, 'a');
      const c = await loadModuleGraph(loader, 'c');
      const d = await loadModuleGraph(loader, 'd');
      linkModuleGraph(a);
      linkModuleGraph(c);
      realm.globalObject.defineOwnProperty('markerA', {
        value: markerA,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('markerD', {
        value: markerD,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('trigger', {
        value: realm.createNativeFunction({
          name: 'trigger',
          length: 0,
          call() {
            evaluateModuleGraph(c);
            try {
              evaluateModuleGraph(d);
            } catch {
              // The outer module's later abrupt completion is independently
              // observable and must not replace d's completed SCC error.
            }
            return undefined;
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const aError = await rejected(loader.loadAndEvaluate('a'));
      const cError = await rejected(loader.loadAndEvaluate('c'));

      assertSame(aError.value, markerA);
      assertSame(cError.value, markerD);
    },
  },
];
