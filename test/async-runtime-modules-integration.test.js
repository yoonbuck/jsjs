import {
  createAgent,
  createModuleLoader,
  createRealm,
  evaluateScript,
  ModuleLoaderError,
} from '../src/index.js';
import { assertSame } from './harness/assert.js';

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 * @returns {void}
 */
function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * @param {Record<string, string | Promise<string>>} sources
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @returns {import('../src/runtime/module-loader.js').ModuleLoader}
 */
function loaderFor(sources, realm) {
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
 * @returns {Promise<unknown>}
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
    name: 'Promise reactions resume generators in Agent FIFO order',
    run() {
      const realm = createRealm();
      assertNormal(
        evaluateScript(
          realm,
          `
            var log = [];
            function* values() {
              log.push("start");
              var input = yield 1;
              log.push("resume:" + input);
              return 3;
            }
            var iterator = values();
            Promise.resolve(iterator.next().value).then(function (value) {
              var step = iterator.next(value + 1);
              log.push("done:" + step.value + ":" + step.done);
            });
            log.push("sync");
            log.join(",");
          `,
        ),
        'start,sync',
      );
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormal(
        evaluateScript(realm, 'log.join(",")'),
        'start,sync,resume:2,done:3:true',
      );
    },
  },
  {
    name: 'cross-Realm Promise jobs keep handler Realm intrinsics on one Agent',
    run() {
      const agent = createAgent();
      const constructorRealm = createRealm({ agent });
      const handlerRealm = createRealm({ agent });

      assertNormal(
        evaluateScript(
          handlerRealm,
          `
            var callbackLog = [];
            var callback = function (value) {
              var created = [];
              callbackLog.push(value + ":" + (created instanceof Array));
              callbackArray = created;
              return created;
            };
          `,
        ),
        undefined,
      );
      const callback = handlerRealm.globalObject.get('callback');
      constructorRealm.globalObject.defineOwnProperty('handler', {
        value: callback,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertNormal(
        evaluateScript(
          constructorRealm,
          `
            var promise = Promise.resolve(1);
            var derived = promise.then(handler);
          `,
        ),
        undefined,
      );
      const derived = constructorRealm.globalObject.get('derived');

      assertSame(agent.runJobs().failures.length, 0);
      assertNormal(
        evaluateScript(handlerRealm, 'callbackLog.join(",")'),
        '1:true',
      );
      assertSame(
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          handlerRealm.globalObject.get('callbackArray')
        ).getPrototype(),
        handlerRealm.intrinsics.arrayPrototype,
      );
      assertSame(
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          derived
        ).getPrototype(),
        constructorRealm.intrinsics.promisePrototype,
      );
      assertSame(
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          derived
        ).getPrototype() === handlerRealm.intrinsics.promisePrototype,
        false,
      );
    },
  },
  {
    name: 'module code creates Promise and generator values from its loader Realm',
    async run() {
      const realm = createRealm();
      const loader = loaderFor(
        {
          root: `
            export function* values() {
              yield 1;
              return 2;
            }
            export const promise = Promise.resolve(3);
          `,
        },
        realm,
      );
      const namespace = await loader.loadAndEvaluate('root');
      const generatorFunction = namespace.get('values');
      const iterator = generatorFunction.callFunction(undefined, []);
      const promise = namespace.get('promise');

      assertSame(
        generatorFunction.getPrototype(),
        realm.intrinsics.generatorFunctionPrototype,
      );
      assertSame(
        iterator.getPrototype().getPrototype(),
        realm.intrinsics.generatorPrototype,
      );
      assertSame(promise.getPrototype(), realm.intrinsics.promisePrototype);
      assertSame(promise.promiseResult, 3);
      assertSame(realm.agent.runJobs().failures.length, 0);
    },
  },
  {
    name: 'live module bindings are observed from a Promise reaction',
    async run() {
      const realm = createRealm();
      const loader = loaderFor(
        {
          state: `
            export let value = 1;
            export function set(next) {
              value = next;
            }
          `,
          root: `
            import { value, set } from 'state';
            export function schedule() {
              return Promise.resolve().then(function () {
                set(2);
                return value;
              });
            }
            export { value };
          `,
        },
        realm,
      );
      const namespace = await loader.loadAndEvaluate('root');
      const schedule = namespace.get('schedule');
      const scheduled = schedule.callFunction(undefined, []);
      let reactionResult;
      const record = realm.createNativeFunction({
        name: 'record',
        length: 1,
        call(_thisValue, args) {
          reactionResult = args[0];
          return undefined;
        },
      });
      scheduled.get('then').callFunction(scheduled, [record]);

      assertSame(namespace.get('value'), 1);
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(namespace.get('value'), 2);
      assertSame(reactionResult, 2);
    },
  },
  {
    name: 'module evaluation failures and queued rejections preserve guest identity',
    async run() {
      /** @type {Array<{ promise: unknown, operation: string }>} */
      const rejectionEvents = [];
      const agent = createAgent({
        jobHost: {
          scheduleMicrotask() {},
          promiseRejectionTracker(promise, operation) {
            rejectionEvents.push({ promise, operation });
          },
        },
      });
      const realm = createRealm({ agent });
      assertNormal(
        evaluateScript(
          realm,
          `
            var marker = new Error("guest marker");
            var rejectedPromise = Promise.reject(marker);
          `,
        ),
        undefined,
      );
      const marker = realm.globalObject.get('marker');
      const rejectedPromise = realm.globalObject.get('rejectedPromise');
      const loader = loaderFor(
        { root: 'export const error = marker; throw error;' },
        realm,
      );

      const error = await rejected(loader.loadAndEvaluate('root'));
      assertSame(error instanceof ModuleLoaderError, true);
      assertSame(/** @type {ModuleLoaderError} */ (error).phase, 'evaluate');
      assertSame(/** @type {ModuleLoaderError} */ (error).value, marker);
      assertSame(rejectionEvents.length, 1);
      assertSame(rejectionEvents[0].promise, rejectedPromise);
      assertSame(rejectionEvents[0].operation, 'reject');
      assertSame(
        /** @type {{ promiseResult: unknown }} */ (rejectedPromise)
          .promiseResult,
        marker,
      );
      assertSame(agent.runJobs().failures.length, 0);
    },
  },
  {
    name: 'host Promise loading never drains or reorders guest jobs',
    async run() {
      const realm = createRealm();
      assertNormal(
        evaluateScript(
          realm,
          `
            var log = [];
            Promise.resolve().then(function () {
              log.push("reaction");
            });
            undefined;
          `,
        ),
        undefined,
      );
      const loader = loaderFor(
        { root: Promise.resolve('export const value = 7;') },
        realm,
      );

      const namespace = await loader.loadAndEvaluate('root');
      assertNormal(evaluateScript(realm, 'log.join(",")'), '');
      assertSame(namespace.get('value'), 7);
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormal(evaluateScript(realm, 'log.join(",")'), 'reaction');
    },
  },
];
