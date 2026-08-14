import { createAgent, createRealm, evaluateScript } from '../src/index.js';
import { EngineObject } from '../src/runtime/object.js';
import { createAbruptRealmCallable } from '../src/runtime/function-realm.js';
import { PromiseObject } from '../src/runtime/promise.js';
import { assertSame, assertThrows } from './harness/assert.js';

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 * @returns {void}
 */
function assertNormalValue(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {{ type: string, value: unknown }} completion
 * @returns {void}
 */
function assertGuestTypeError(realm, completion) {
  assertSame(completion.type, 'throw');
  assertSame(
    /** @type {EngineObject} */ (completion.value).getPrototype(),
    realm.intrinsics.typeErrorPrototype,
  );
}

/**
 * @param {unknown} value
 * @returns {PromiseObject}
 */
function promiseObject(value) {
  if (!(value instanceof PromiseObject)) {
    throw new Error('Expected a PromiseObject');
  }

  return value;
}

/**
 * Wraps only Promise reaction jobs, so tests observe their running Realm
 * through the public Agent job callback boundary rather than Promise slots.
 *
 * @param {import('../src/runtime/agent.js').Agent} agent
 * @returns {Array<import('../src/runtime/realm.js').Realm | null>}
 */
function observeReactionJobRealms(agent) {
  const enqueueJob = agent.enqueueJob.bind(agent);
  /** @type {Array<import('../src/runtime/realm.js').Realm | null>} */
  const observed = [];

  agent.enqueueJob = (job) => {
    if (!job.kind.startsWith('promise-')) {
      enqueueJob(job);
      return;
    }

    enqueueJob({
      ...job,
      callback(args) {
        observed.push(agent.currentJobRealm);
        return job.callback(args);
      },
    });
  };

  return observed;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @returns {{
 *   promise: PromiseObject,
 *   resolve: import('../src/runtime/descriptors.js').CallableLike,
 * }}
 */
function createPendingPromise(realm, name) {
  assertNormalValue(
    evaluateScript(
      realm,
      [
        `var ${name}Resolve;`,
        `var ${name} = new Promise(function (resolve) {`,
        `  ${name}Resolve = resolve;`,
        '});',
      ].join('\n'),
    ),
    undefined,
  );

  return {
    promise: promiseObject(realm.globalObject.get(name)),
    resolve:
      /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
        realm.globalObject.get(`${name}Resolve`)
      ),
  };
}

export default [
  {
    name: 'then reactions are asynchronous FIFO and chain through returned values',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var log = [];',
            'var resolve;',
            'var p = new Promise(function (r) { resolve = r; });',
            'p.then(function (value) { log.push("a" + value); return value + 1; })',
            ' .then(function (value) { log.push("c" + value); });',
            'p.then(function (value) { log.push("b" + value); });',
            'log.push("sync");',
            'resolve(1);',
            'log.join(",");',
          ].join('\n'),
        ),
        'sync',
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'log.join(",")'),
        'sync,a1,b1,c2',
      );
    },
  },
  {
    name: 'empty and non-callable handlers implement identity and thrower',
    run: () => {
      const realm = createRealm();

      evaluateScript(
        realm,
        [
          'var values = [];',
          'Promise.resolve(1).then().then(function (x) { values.push(x); });',
          'Promise.reject(2).then().catch(function (x) { values.push(x); });',
          'Promise.resolve(3).then(0, {}).then(function (x) { values.push(x); });',
          'Promise.resolve(4).then(function () { throw "handler throw"; })',
          ' .catch(function (x) { values.push(x); });',
          'Promise.resolve(5).then(function () {',
          '  return { then: function (resolve) { resolve("thenable"); } };',
          '}).then(function (x) { values.push(x); });',
        ].join('\n'),
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'values.join(",")'),
        '1,2,3,handler throw,thenable',
      );
    },
  },
  {
    name: 'reactions added while draining run after earlier queued reactions',
    run: () => {
      const realm = createRealm();

      evaluateScript(
        realm,
        [
          'var log = [];',
          'var p = Promise.resolve("value");',
          'p.then(function () {',
          '  log.push("a");',
          '  p.then(function () { log.push("c"); });',
          '});',
          'p.then(function () { log.push("b"); });',
        ].join('\n'),
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'log.join(",")'), 'a,b,c');
    },
  },
  {
    name: 'then creates distinct children and catch delegates to then',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var p = Promise.resolve(1);',
            'var first = p.then();',
            'var second = p.then();',
            'var calls = 0;',
            'var fulfilled; var rejected;',
            'p.then = function (onFulfilled, onRejected) {',
            '  calls = calls + 1;',
            '  fulfilled = onFulfilled;',
            '  rejected = onRejected;',
            '  return "delegated";',
            '};',
            '(first !== second) + ":" + (first instanceof Promise) + ":" +',
            '(p.catch(undefined) === "delegated") + ":" + calls + ":" +',
            '(fulfilled === undefined) + ":" + (rejected === undefined);',
          ].join('\n'),
        ),
        'true:true:true:1:true:true',
      );
    },
  },
  {
    name: 'catch generically invokes a primitive receiver then',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var received;',
            'String.prototype.then = function (onFulfilled, onRejected) {',
            '  received = onFulfilled === undefined && onRejected === 0;',
            '  return this.valueOf();',
            '};',
            'Promise.prototype.catch.call("value", 0) + ":" + received;',
          ].join('\n'),
        ),
        'value:true',
      );
    },
  },
  {
    name: 'then rejects incompatible receivers',
    run: () => {
      const realm = createRealm();

      assertGuestTypeError(
        realm,
        evaluateScript(realm, 'Promise.prototype.then.call({})'),
      );
    },
  },
  {
    name: 'Promise resolve and reject implement identity and thenable settlement',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var input = Promise.resolve("same");',
            'var resolved = Promise.resolve(input);',
            'var rejected = Promise.reject("reason");',
            'var adopted = Promise.resolve({',
            '  then: function (resolve) { resolve("thenable"); }',
            '});',
            '(resolved === input) + ":" + (rejected instanceof Promise) + ":" +',
            '(adopted instanceof Promise);',
          ].join('\n'),
        ),
        'true:true:true',
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var results = [];',
            'rejected.catch(function (reason) { results.push(reason); });',
            'adopted.then(function (value) { results.push(value); });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'results.join(",")'),
        'reason,thenable',
      );
    },
  },
  {
    name: 'then uses the species constructor and validates invalid species values',
    run: () => {
      const realm = createRealm();
      const species = realm.agent.wellKnownSymbols.species;
      const constructor = /** @type {EngineObject} */ (
        realm.globalObject.get('Promise')
      );
      const descriptor = constructor.getOwnProperty(species);

      assertSame(descriptor?.enumerable, false);
      assertSame(descriptor?.configurable, true);
      assertSame('get' in /** @type {object} */ (descriptor), true);
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'function Species(executor) {',
            '  executor(function () {}, function () {});',
            '}',
            'var p = Promise.resolve("value");',
            'p.constructor = {};',
            'p.constructor[Symbol.species] = Species;',
            'var child = p.then(function (value) { return value; });',
            'var defaultSpecies = Promise.resolve(1);',
            'defaultSpecies.constructor = {};',
            'var byUndefined = defaultSpecies.then();',
            'defaultSpecies.constructor[Symbol.species] = null;',
            'var byNull = defaultSpecies.then();',
            '(Promise[Symbol.species] === Promise) + ":" + (child instanceof Species) + ":" +',
            '(byUndefined instanceof Promise) + ":" + (byNull instanceof Promise);',
          ].join('\n'),
        ),
        'true:true:true:true',
      );
      assertSame(realm.agent.runJobs().failures.length, 0);

      assertGuestTypeError(
        realm,
        evaluateScript(
          realm,
          'var badConstructor = Promise.resolve(1); badConstructor.constructor = 1; badConstructor.then();',
        ),
      );
      assertGuestTypeError(
        realm,
        evaluateScript(
          realm,
          [
            'var badSpecies = Promise.resolve(1);',
            'badSpecies.constructor = {};',
            'badSpecies.constructor[Symbol.species] = 1;',
            'badSpecies.then();',
          ].join('\n'),
        ),
      );
    },
  },
  {
    name: 'reaction jobs use null, handler, and fallback lookup Realms',
    run: () => {
      const agent = createAgent();
      const realm = createRealm({ agent });
      const foreignRealm = createRealm({ agent });
      const observedRealms = observeReactionJobRealms(agent);
      const source = promiseObject(
        evaluateScript(realm, 'Promise.resolve("source")').value,
      );
      const localThen =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (realm.intrinsics.promisePrototype).get(
            'then',
          )
        );
      const foreignThen =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            foreignRealm.intrinsics.promisePrototype
          ).get('then')
        );
      let handlerRealm = null;
      const localHandler = realm.createNativeFunction({
        name: 'localHandler',
        length: 1,
        call() {
          handlerRealm = agent.currentJobRealm;
          return 'local';
        },
      });

      const nullChild = promiseObject(localThen.callFunction(source, []));
      const localChild = promiseObject(
        foreignThen.callFunction(source, [localHandler]),
      );
      const abruptHandler = createAbruptRealmCallable(
        foreignRealm,
        foreignRealm.createGuestError('TypeError', 'abrupt handler lookup'),
      );
      const fallbackChild = promiseObject(
        foreignThen.callFunction(source, [abruptHandler]),
      );

      assertSame(agent.runJobs().failures.length, 0);
      assertSame(observedRealms[0], null);
      assertSame(observedRealms[1], realm);
      assertSame(observedRealms[2], foreignRealm);
      assertSame(handlerRealm, realm);
      assertSame(nullChild.promiseState, 'fulfilled');
      assertSame(nullChild.promiseResult, 'source');
      assertSame(localChild.promiseState, 'fulfilled');
      assertSame(localChild.promiseResult, 'local');
      assertSame(fallbackChild.promiseState, 'fulfilled');
    },
  },
  {
    name: 'thenable jobs use the foreign then Realm and lookup Realm fallback',
    run: () => {
      const agent = createAgent();
      const realm = createRealm({ agent });
      const foreignRealm = createRealm({ agent });
      const observedRealms = observeReactionJobRealms(agent);
      const foreignThenable = new EngineObject(
        realm.intrinsics.objectPrototype,
      );
      const abruptThenable = new EngineObject(realm.intrinsics.objectPrototype);
      const foreignThen = foreignRealm.createNativeFunction({
        name: 'then',
        length: 2,
        call(_thisValue, args) {
          return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            args[0]
          ).callFunction(undefined, ['foreign']);
        },
      });
      foreignThenable.defineOwnProperty('then', {
        value: foreignThen,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      abruptThenable.defineOwnProperty('then', {
        value: createAbruptRealmCallable(
          realm,
          realm.createGuestError('TypeError', 'abrupt then lookup'),
        ),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const first = createPendingPromise(realm, 'first');
      const second = createPendingPromise(realm, 'second');

      first.resolve.callFunction(undefined, [foreignThenable]);
      second.resolve.callFunction(undefined, [abruptThenable]);
      assertSame(agent.runJobs().failures.length, 0);
      assertSame(first.promise.promiseState, 'fulfilled');
      assertSame(first.promise.promiseResult, 'foreign');
      assertSame(second.promise.promiseState, 'pending');
      assertSame(observedRealms[0], foreignRealm);
      assertSame(observedRealms[1], realm);
    },
  },
  {
    name: 'rejection tracking observes one reject and one later handle',
    run: () => {
      /** @type {Array<[unknown, 'reject' | 'handle']>} */
      const events = [];
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {},
          promiseRejectionTracker(promise, operation) {
            events.push([promise, operation]);
          },
        },
      });
      const rejected = promiseObject(
        evaluateScript(
          realm,
          'var rejected = Promise.reject("reason"); rejected;',
        ).value,
      );

      assertSame(events.length, 1);
      assertSame(events[0][0], rejected);
      assertSame(events[0][1], 'reject');
      assertNormalValue(
        evaluateScript(
          realm,
          'rejected.then(undefined, function () {}); undefined;',
        ),
        undefined,
      );
      assertSame(events.length, 2);
      assertSame(events[1][0], rejected);
      assertSame(events[1][1], 'handle');
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(events.length, 2);
    },
  },
  {
    name: 'rejection tracker failures preserve Promise state and queued ordering',
    run: () => {
      const trackerError = new Error('tracker failed');
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {},
          promiseRejectionTracker() {
            throw trackerError;
          },
        },
      });

      evaluateScript(
        realm,
        [
          'var log = [];',
          'var rejected = Promise.reject("reason");',
          'rejected.then(undefined, function () { log.push("first"); });',
          'Promise.resolve(1).then(function () { log.push("second"); });',
        ].join('\n'),
      );
      const rejected = promiseObject(realm.globalObject.get('rejected'));

      assertSame(rejected.promiseState, 'rejected');
      assertSame(rejected.promiseResult, 'reason');
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'log.join(",")'), 'first,second');
      const failures = realm.agent.takeJobFailures();
      assertSame(failures.length, 2);
      assertSame(failures[0].category, 'host-hook');
      assertSame(failures[0].error, trackerError);
      assertSame(failures[1].category, 'host-hook');
      assertSame(failures[1].error, trackerError);
      assertSame(rejected.promiseState, 'rejected');
      assertSame(rejected.promiseResult, 'reason');
    },
  },
  {
    name: 'scheduler failure retains every pending Promise reaction for recovery',
    run: () => {
      const schedulerError = new Error('scheduler failed once');
      let shouldThrow = true;
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {
            if (shouldThrow) {
              shouldThrow = false;
              throw schedulerError;
            }
          },
        },
      });
      const pending = createPendingPromise(realm, 'pending');
      const then =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (realm.intrinsics.promisePrototype).get(
            'then',
          )
        );
      const firstChild = promiseObject(then.callFunction(pending.promise, []));
      const secondChild = promiseObject(then.callFunction(pending.promise, []));

      assertSame(
        assertThrows(
          () => pending.resolve.callFunction(undefined, ['settled']),
          Error,
        ),
        schedulerError,
      );
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(firstChild.promiseState, 'fulfilled');
      assertSame(firstChild.promiseResult, 'settled');
      assertSame(secondChild.promiseState, 'fulfilled');
      assertSame(secondChild.promiseResult, 'settled');
    },
  },
];
