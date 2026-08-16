import { assertSame, assertThrows } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoader,
  ModuleLoaderError,
  Realm,
} from '../src/index.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';

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
 * @returns {{ promise: Promise<void>, resolve: () => void }}
 */
function deferred() {
  let resolve = () => {};
  const promise = new Promise((complete) => {
    resolve = () => complete(undefined);
  });
  return { promise, resolve };
}

/**
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
    throw new Error('Expected concurrent cyclic module roots to settle');
  }
  if (failure !== undefined) {
    throw failure;
  }
  return /** @type {T} */ (value);
}

export default [
  {
    name: 'loader uses canonical identity, serial source order, and one source load',
    async run() {
      /** @type {string[]} */
      const calls = [];
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier, referrer) {
          calls.push(`resolve:${specifier}:${referrer}`);
          return specifier === 'alias' ? 'root' : specifier;
        },
        load(identifier) {
          calls.push(`load:${identifier}`);
          return identifier === 'root'
            ? 'import "a"; import "b"; export const root = 1;'
            : 'export const value = 1;';
        },
      });
      const [first, second] = await Promise.all([
        loadModuleGraph(loader, 'alias', null),
        loadModuleGraph(loader, 'root', null),
      ]);
      assertSame(first, second);
      assertSame(
        calls.join(','),
        'resolve:alias:null,resolve:root:null,load:root,resolve:a:root,load:a,resolve:b:root,load:b',
      );
    },
  },
  {
    name: 'loader rejects malformed source records and permits retry after parse failure',
    async run() {
      let loads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          return 'm';
        },
        load() {
          loads += 1;
          return loads === 1
            ? 'export {'
            : { sourceText: 'export const x = 1;' };
        },
      });
      const first = await rejected(loadModuleGraph(loader, 'm', null));
      assertSame(first instanceof ModuleLoaderError, true);
      assertSame(first.phase, 'parse');
      await loadModuleGraph(loader, 'm', null);
      assertSame(loads, 2);
      assertThrows(
        () =>
          createModuleLoader(
            createRealm(),
            /** @type {any} */ ({ resolve() {} }),
          ),
        TypeError,
      );
    },
  },
  {
    name: 'loader rejects an uninitialized Realm lookalike',
    run() {
      assertThrows(
        () =>
          createModuleLoader(Object.create(Realm.prototype), {
            resolve() {
              return 'm';
            },
            load() {
              return 'export const x = 1;';
            },
          }),
        TypeError,
      );
    },
  },
  {
    name: 'ModuleLoader validates direct construction',
    run() {
      const host = {
        resolve() {
          return 'm';
        },
        load() {
          return 'export const x = 1;';
        },
      };
      assertThrows(
        () => new ModuleLoader(/** @type {any} */ (null), host),
        TypeError,
      );
      assertThrows(
        () => new ModuleLoader(createRealm(), /** @type {any} */ (null)),
        TypeError,
      );
    },
  },
  {
    name: 'loader keeps its original Realm after a Realm replacement attempt',
    async run() {
      const originalRealm = createRealm();
      const replacementRealm = createRealm();
      const loader = createModuleLoader(originalRealm, {
        resolve() {
          return 'm';
        },
        load() {
          return 'export const x = 1;';
        },
      });

      try {
        /** @type {any} */ (loader).realm = replacementRealm;
      } catch {}

      const record = await loadModuleGraph(loader, 'm');
      assertSame(record.realm === originalRealm, true);
    },
  },
  {
    name: 'loader keeps invoking its original hooks after host replacement attempts',
    async run() {
      /** @type {string[]} */
      const originalCalls = [];
      /** @type {string[]} */
      const replacementCalls = [];
      /**
       * @type {{
       *   resolve: (specifier: string, referrer: string | null) => string,
       *   load: (identifier: string) => string,
       * }}
       */
      const originalHost = {
        resolve(specifier, referrer) {
          originalCalls.push(
            `resolve:${this === originalHost}:${specifier}:${referrer}`,
          );
          return 'bound';
        },
        load(identifier) {
          originalCalls.push(`load:${this === originalHost}:${identifier}`);
          return 'export const x = 1;';
        },
      };
      /**
       * @type {{
       *   resolve: (specifier: string, referrer: string | null) => string,
       *   load: (identifier: string) => string,
       * }}
       */
      const replacementHost = {
        resolve() {
          replacementCalls.push('resolve');
          return 'replacement';
        },
        load() {
          replacementCalls.push('load');
          return 'export const replacement = 1;';
        },
      };
      const loader = createModuleLoader(createRealm(), originalHost);

      try {
        /** @type {any} */ (loader).host = replacementHost;
      } catch {}
      originalHost.resolve = replacementHost.resolve;
      originalHost.load = replacementHost.load;

      const record = await loadModuleGraph(loader, 'raw');
      assertSame(record.identifier, 'bound');
      assertSame(
        originalCalls.join(','),
        'resolve:true:raw:null,load:true:bound',
      );
      assertSame(replacementCalls.join(','), '');
    },
  },
  {
    name: 'loader ignores public registry mutation and property injection',
    async run() {
      const realm = createRealm();
      let loads = 0;
      const loader = createModuleLoader(realm, {
        resolve() {
          return 'root';
        },
        load() {
          loads += 1;
          return 'runs += 1; export const value = runs;';
        },
      });
      realm.globalObject.defineOwnProperty('runs', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const first = await loader.loadAndEvaluate('root');
      const publicLoader = /** @type {any} */ (loader);
      for (const field of [
        'records',
        'resolveInFlight',
        'loadInFlight',
        'graphInFlight',
        'completedGraphs',
        'graphDependencies',
        'cycleOwners',
        'activeLoadIdentifiers',
        'evaluationErrors',
      ]) {
        const value = publicLoader[field];
        if (
          value !== null &&
          typeof value === 'object' &&
          typeof value.clear === 'function'
        ) {
          value.clear();
        }
        publicLoader[field] = new Map();
      }

      const second = await loader.loadAndEvaluate('root');

      assertSame(second, first);
      assertSame(second.get('value'), 1);
      assertSame(loads, 1);
      assertSame(realm.globalObject.get('runs'), 1);
    },
  },
  {
    name: 'loader keeps evaluation failures cached despite record mutation',
    async run() {
      const marker = {};
      const realm = createRealm();
      const loader = createModuleLoader(realm, {
        resolve() {
          return 'root';
        },
        load() {
          return 'throw marker;';
        },
      });
      realm.globalObject.defineOwnProperty('marker', {
        value: marker,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const record = await loadModuleGraph(loader, 'root');
      const first = await rejected(loader.loadAndEvaluate('root'));
      /** @type {any} */ (record).evaluationError = null;
      const second = await rejected(loader.loadAndEvaluate('root'));

      assertSame(second, first);
      assertSame(second.value, marker);
    },
  },
  {
    name: 'loader shares a pending canonical source acquisition with concurrent callers',
    async run() {
      const source = deferred();
      const loadStarted = deferred();
      const secondResolveStarted = deferred();
      let resolves = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          resolves += 1;
          if (resolves === 2) {
            secondResolveStarted.resolve();
          }
          return 'm';
        },
        load() {
          loadStarted.resolve();
          return source.promise.then(() => 'export const x = 1;');
        },
      });

      const first = loadModuleGraph(loader, 'm');
      await loadStarted.promise;
      const second = loadModuleGraph(loader, 'm');
      await secondResolveStarted.promise;
      await Promise.resolve();
      source.resolve();
      const [firstRecord, secondRecord] = await Promise.all([first, second]);
      assertSame(firstRecord, secondRecord);
    },
  },
  {
    name: 'loader deduplicates a concurrent request after async load returns its promise',
    async run() {
      const source = deferred();
      const loadReturned = deferred();
      const secondResolveStarted = deferred();
      let loads = 0;
      let resolves = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          resolves += 1;
          if (resolves === 2) {
            secondResolveStarted.resolve();
          }
          return 'm';
        },
        load() {
          loads += 1;
          const result = source.promise.then(() => 'export const x = 1;');
          loadReturned.resolve();
          return result;
        },
      });

      const first = loadModuleGraph(loader, 'm');
      await loadReturned.promise;
      const second = loadModuleGraph(loader, 'm');
      await secondResolveStarted.promise;
      source.resolve();
      const [firstRecord, secondRecord] = await Promise.all([first, second]);
      assertSame(firstRecord, secondRecord);
      assertSame(loads, 1);
    },
  },
  {
    name: 'loader rejects accessor, unknown, and inherited source record fields',
    async run() {
      const accessor = {};
      Object.defineProperty(accessor, 'sourceText', {
        get() {
          return 'export const x = 1;';
        },
      });
      const inherited = Object.create({ sourceText: 'export const x = 1;' });
      const records = [
        accessor,
        { sourceText: 'export const x = 1;', unexpected: true },
        inherited,
      ];

      for (const record of records) {
        const loader = createModuleLoader(createRealm(), {
          resolve() {
            return 'm';
          },
          load() {
            return record;
          },
        });
        const error = await rejected(loadModuleGraph(loader, 'm'));
        assertSame(error instanceof ModuleLoaderError, true);
        assertSame(error.phase, 'load');
      }
    },
  },
  {
    name: 'loader passes only the canonical identifier to load',
    async run() {
      /** @type {string[]} */
      const identifiers = [];
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          return 'canonical';
        },
        load(identifier) {
          identifiers.push(identifier);
          return 'export const x = 1;';
        },
      });

      await loadModuleGraph(loader, 'raw');
      assertSame(identifiers.join(','), 'canonical');
    },
  },
  {
    name: 'loader retries failed resolve and load acquisitions',
    async run() {
      let resolves = 0;
      let loads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          resolves += 1;
          if (resolves === 1) {
            throw new Error('resolve failed');
          }
          return 'm';
        },
        load() {
          loads += 1;
          if (loads === 1) {
            throw new Error('load failed');
          }
          return 'export const x = 1;';
        },
      });

      const resolveError = await rejected(loadModuleGraph(loader, 'm'));
      assertSame(resolveError instanceof ModuleLoaderError, true);
      assertSame(resolveError.phase, 'resolve');
      const loadError = await rejected(loadModuleGraph(loader, 'm'));
      assertSame(loadError instanceof ModuleLoaderError, true);
      assertSame(loadError.phase, 'load');
      await loadModuleGraph(loader, 'm');
      assertSame(resolves, 3);
      assertSame(loads, 2);
    },
  },
  {
    name: 'loader retries a parsed parent graph after a child load failure',
    async run() {
      let childLoads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          if (identifier === 'root') {
            return 'import "child"; export const root = 1;';
          }
          childLoads += 1;
          if (childLoads === 1) {
            throw new Error('child failed');
          }
          return 'export const child = 1;';
        },
      });

      const first = await rejected(loadModuleGraph(loader, 'root'));
      assertSame(first instanceof ModuleLoaderError, true);
      const root = await loadModuleGraph(loader, 'root');
      assertSame(childLoads, 2);
      assertSame(root.resolvedRequestedModules[0].module.identifier, 'child');
    },
  },
  {
    name: 'loader rejects source records with unknown symbol fields',
    async run() {
      const symbol = Symbol('unknown');
      const sourceRecord = {
        sourceText: 'export const x = 1;',
        [symbol]: true,
      };
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          return 'm';
        },
        load() {
          return sourceRecord;
        },
      });

      const error = await rejected(loadModuleGraph(loader, 'm'));
      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(error.phase, 'load');
    },
  },
  {
    name: 'loader completes concurrently requested source cycles',
    async run() {
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          return identifier === 'a'
            ? 'import "b"; export const a = 1;'
            : 'import "a"; export const b = 1;';
        },
      });

      const [a, b] = await Promise.all([
        loadModuleGraph(loader, 'a'),
        loadModuleGraph(loader, 'b'),
      ]);
      assertSame(a.resolvedRequestedModules[0].module, b);
      assertSame(b.resolvedRequestedModules[0].module, a);
    },
  },
  {
    name: 'public loader waits for a complete overlapping graph before linking concurrent roots',
    async run() {
      const realm = createRealm();
      realm.globalObject.defineOwnProperty('aRuns', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('bRuns', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const loader = createModuleLoader(realm, {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          return identifier === 'a'
            ? 'import "a"; import "b"; aRuns += 1; export const value = aRuns;'
            : 'import "a"; import "b"; bRuns += 1; export const value = bRuns;';
        },
      });

      const [a, b] = await resolvesPromptly(
        Promise.all([
          loader.loadAndEvaluate('a'),
          loader.loadAndEvaluate('b'),
        ]),
      );

      assertSame(a.get('value'), 1);
      assertSame(b.get('value'), 1);
      assertSame(realm.globalObject.get('aRuns'), 1);
      assertSame(realm.globalObject.get('bRuns'), 1);
      assertSame(await loader.loadAndEvaluate('a'), a);
      assertSame(await loader.loadAndEvaluate('b'), b);
    },
  },
  {
    name: 'public loader does not await its owner across a same-SCC dependency edge',
    async run() {
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          if (identifier === 'a') {
            return 'import "b"; export const value = "a";';
          }
          if (identifier === 'b') {
            return 'import "c"; export const value = "b";';
          }
          return 'import "a"; import "b"; export const value = "c";';
        },
      });

      const [a, b, c] = await resolvesPromptly(
        Promise.all([
          loader.loadAndEvaluate('a'),
          loader.loadAndEvaluate('b'),
          loader.loadAndEvaluate('c'),
        ]),
      );

      assertSame(a.get('value'), 'a');
      assertSame(b.get('value'), 'b');
      assertSame(c.get('value'), 'c');
      assertSame(await loader.loadAndEvaluate('a'), a);
      assertSame(await loader.loadAndEvaluate('b'), b);
      assertSame(await loader.loadAndEvaluate('c'), c);
    },
  },
  {
    name: 'loader settles concurrent roots across an overlapping source cycle',
    async run() {
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          if (identifier === 'a') {
            return 'import "b"; import "c"; export const a = 1;';
          }
          if (identifier === 'b') {
            return 'import "a"; export const b = 1;';
          }
          return 'import "b"; export const c = 1;';
        },
      });

      const [a, b, c] = await resolvesPromptly(
        Promise.all([
          loadModuleGraph(loader, 'a'),
          loadModuleGraph(loader, 'b'),
          loadModuleGraph(loader, 'c'),
        ]),
      );

      assertSame(a.resolvedRequestedModules[0].module, b);
      assertSame(a.resolvedRequestedModules[1].module, c);
      assertSame(b.resolvedRequestedModules[0].module, a);
      assertSame(c.resolvedRequestedModules[0].module, b);
    },
  },
  {
    name: 'loader returns the delayed concurrent cyclic B root record',
    async run() {
      const delayedBStarted = deferred();
      /** @type {Promise<import('../src/runtime/module-record.js').SourceTextModuleRecord> | undefined} */
      let delayedB;
      let scheduledB = false;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier, referrer) {
          if (specifier === 'a' && referrer === 'b' && scheduledB === false) {
            scheduledB = true;
            Promise.resolve().then(() => {
              delayedB = loadModuleGraph(loader, 'b');
              delayedBStarted.resolve();
            });
          }
          return specifier;
        },
        load(identifier) {
          return identifier === 'a'
            ? 'import "b"; export const a = 1;'
            : 'import "a"; export const b = 1;';
        },
      });

      const aGraph = loadModuleGraph(loader, 'a');
      await delayedBStarted.promise;
      if (delayedB === undefined) {
        throw new Error('Expected delayed B root graph');
      }
      const [a, b] = await Promise.all([aGraph, delayedB]);

      assertSame(a.identifier, 'a');
      assertSame(b.identifier, 'b');
      assertSame(a.resolvedRequestedModules[0].module, b);
      assertSame(b.resolvedRequestedModules[0].module, a);
    },
  },
  {
    name: 'loader keeps cyclic graphs pending through transitive failure and retry',
    async run() {
      const childStarted = deferred();
      const childFailure = deferred();
      let childLoads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          if (identifier === 'a') {
            return 'import "b"; import "c"; export const a = 1;';
          }
          if (identifier === 'b') {
            return 'import "a"; export const b = 1;';
          }

          childLoads += 1;
          if (childLoads === 1) {
            childStarted.resolve();
            return childFailure.promise.then(() => {
              throw new Error('child failed');
            });
          }
          return 'export const c = 1;';
        },
      });

      const a = loadModuleGraph(loader, 'a');
      await childStarted.promise;
      const b = loadModuleGraph(loader, 'b');
      childFailure.resolve();
      const aError = await rejected(a);
      const bError = await rejected(b);
      assertSame(aError instanceof ModuleLoaderError, true);
      assertSame(bError instanceof ModuleLoaderError, true);

      await loadModuleGraph(loader, 'b');
      assertSame(childLoads, 2);
    },
  },
  {
    name: 'loader keeps concurrently acquired cyclic graphs pending through failure',
    async run() {
      const childStarted = deferred();
      const childFailure = deferred();
      let childLoads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          if (identifier === 'a') {
            return 'import "b"; import "c"; export const a = 1;';
          }
          if (identifier === 'b') {
            return 'import "a"; export const b = 1;';
          }

          childLoads += 1;
          if (childLoads === 1) {
            childStarted.resolve();
            return childFailure.promise.then(() => {
              throw new Error('child failed');
            });
          }
          return 'export const c = 1;';
        },
      });

      const a = loadModuleGraph(loader, 'a');
      const b = loadModuleGraph(loader, 'b');
      await childStarted.promise;
      childFailure.resolve();
      await rejected(a);
      await rejected(b);

      await loadModuleGraph(loader, 'b');
      assertSame(childLoads, 2);
    },
  },
  {
    name: 'loader keeps overlapping cyclic graphs pending through failure',
    async run() {
      const dependencyStarted = deferred();
      const dependencyFailure = deferred();
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          if (identifier === 'a') {
            return 'import "b"; import "d"; export const a = 1;';
          }
          if (identifier === 'b') {
            return 'import "a"; import "c"; export const b = 1;';
          }
          if (identifier === 'c') {
            return 'import "b"; export const c = 1;';
          }
          dependencyStarted.resolve();
          return dependencyFailure.promise.then(() => {
            throw new Error('dependency failed');
          });
        },
      });

      const a = loadModuleGraph(loader, 'a');
      await dependencyStarted.promise;
      const b = loadModuleGraph(loader, 'b');
      dependencyFailure.resolve();
      await rejected(a);
      await rejected(b);
    },
  },
  {
    name: 'loader registries do not share records across loaders or realms',
    async run() {
      const source = 'export const x = 1;';
      /** @param {import('../src/runtime/realm.js').Realm} realm */
      const create = (realm) =>
        createModuleLoader(realm, {
          resolve() {
            return 'm';
          },
          load() {
            return source;
          },
        });
      const first = create(createRealm());
      const second = create(createRealm());
      const third = create(createRealm());
      const firstRecord = await loadModuleGraph(first, 'm');
      const secondRecord = await loadModuleGraph(second, 'm');
      const thirdRecord = await loadModuleGraph(third, 'm');

      assertSame(firstRecord === secondRecord, false);
      assertSame(firstRecord === thirdRecord, false);
    },
  },
  {
    name: 'loader rejects synchronous same-identifier reentry without corrupting cache cleanup',
    async run() {
      /** @type {any} */
      let nested;
      let loads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          return 'root';
        },
        async load() {
          loads += 1;
          nested = await rejected(loader.loadAndEvaluate('root'));
          return 'export const x = 1;';
        },
      });

      const outer = await loadModuleGraph(loader, 'root');
      const cached = await loadModuleGraph(loader, 'root');
      assertSame(nested instanceof ModuleLoaderError, true);
      assertSame(nested.phase, 'load');
      assertSame(nested.identifier, 'root');
      assertSame(cached, outer);
      assertSame(loads, 1);
    },
  },
  {
    name: 'loader permits different-identifier reentry from a load hook',
    async run() {
      /** @type {any} */
      let nested;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        async load(identifier) {
          if (identifier === 'root') {
            nested = await loader.loadAndEvaluate('child');
            return 'import "child"; export const root = 1;';
          }
          return 'export const child = 1;';
        },
      });

      const root = await loadModuleGraph(loader, 'root');
      if (nested === undefined) {
        throw new Error('Expected nested module namespace');
      }
      assertSame(nested.get('child'), 1);
      assertSame(nested, await loader.loadAndEvaluate('child'));
      assertSame(root.resolvedRequestedModules[0].module.identifier, 'child');
    },
  },
  {
    name: 'loader permits different-identifier reentry that imports its active loader',
    async run() {
      const rootSource = deferred();
      const rootLoadStarted = deferred();
      const childLoadStarted = deferred();
      const childRequestedRoot = deferred();
      /** @type {Promise<any>} */
      let nested = Promise.resolve(undefined);
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier, referrer) {
          if (specifier === 'root' && referrer === 'child') {
            childRequestedRoot.resolve();
          }
          return specifier;
        },
        load(identifier) {
          if (identifier === 'root') {
            nested = loadModuleGraph(loader, 'child');
            rootLoadStarted.resolve();
            return rootSource.promise.then(() => 'export const root = 1;');
          }
          childLoadStarted.resolve();
          return 'import "root"; export const child = 1;';
        },
      });

      const root = loadModuleGraph(loader, 'root');
      await rootLoadStarted.promise;
      let nestedSettled = false;
      nested.then(
        () => {
          nestedSettled = true;
        },
        () => {
          nestedSettled = true;
        },
      );
      await childLoadStarted.promise;
      await childRequestedRoot.promise;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      assertSame(nestedSettled, false);
      rootSource.resolve();
      await root;
      const child = await nested;
      assertSame(child.identifier, 'child');
    },
  },
  {
    name: 'loader waits for each requested child before resolving the next',
    async run() {
      const firstChild = deferred();
      /** @type {string[]} */
      const calls = [];
      const childLoadStarted = deferred();
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier, referrer) {
          calls.push(`resolve:${specifier}:${referrer}`);
          return specifier;
        },
        load(identifier) {
          calls.push(`load:${identifier}`);
          if (identifier === 'root') {
            return 'import "a"; import "b";';
          }
          if (identifier === 'a') {
            childLoadStarted.resolve();
            return firstChild.promise.then(() => 'export const a = 1;');
          }
          return 'export const b = 1;';
        },
      });
      const graph = loadModuleGraph(loader, 'root');
      await childLoadStarted.promise;
      assertSame(
        calls.join(','),
        'resolve:root:null,load:root,resolve:a:root,load:a',
      );
      firstChild.resolve();
      await graph;
      assertSame(
        calls.join(','),
        'resolve:root:null,load:root,resolve:a:root,load:a,resolve:b:root,load:b',
      );
    },
  },
  {
    name: 'loader error identifiers begin after canonicalization',
    async run() {
      const initial = createModuleLoader(createRealm(), {
        resolve() {
          throw new Error('not resolved');
        },
        load() {
          return 'export const x = 1;';
        },
      });
      const initialError = await rejected(loadModuleGraph(initial, 'raw'));
      assertSame(initialError instanceof ModuleLoaderError, true);
      assertSame(initialError.phase, 'resolve');
      assertSame(initialError.identifier, undefined);

      const canonical = createModuleLoader(createRealm(), {
        resolve() {
          return 'canonical';
        },
        load() {
          throw new Error('not loaded');
        },
      });
      const canonicalError = await rejected(loadModuleGraph(canonical, 'raw'));
      assertSame(canonicalError instanceof ModuleLoaderError, true);
      assertSame(canonicalError.phase, 'load');
      assertSame(canonicalError.identifier, 'canonical');
    },
  },
];
