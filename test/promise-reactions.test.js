import { createAgent, createRealm, evaluateScript } from '../src/index.js';
import { GuestErrorSignal, ThrowSignal } from '../src/runtime/completion.js';
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
    name: 'Promise.resolve checks constructibility only when allocation is needed',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var promise = Promise.resolve("same");',
            'var marker = {};',
            'promise.constructor = marker;',
            'var same = Promise.resolve.call(marker, promise);',
            'var allocationError;',
            'try {',
            '  Promise.resolve.call(marker, 1);',
            '} catch (error) {',
            '  allocationError = error.name;',
            '}',
            'var primitiveError;',
            'promise.constructor = 1;',
            'try {',
            '  Promise.resolve.call(1, promise);',
            '} catch (error) {',
            '  primitiveError = error.name;',
            '}',
            '(same === promise) + ":" + allocationError + ":" + primitiveError;',
          ].join('\n'),
        ),
        'true:TypeError:TypeError',
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
    name: 'cross-Agent species lookup uses the constructor Agent symbol and executing Realm',
    run: () => {
      const callerRealm = createRealm();
      const constructorRealm = createRealm();
      const accessorRealm = createRealm();
      const source = promiseObject(
        evaluateScript(constructorRealm, 'Promise.resolve("source")').value,
      );
      const constructor =
        /** @type {import('../src/builtins/shared.js').NativeFunction} */ (
          constructorRealm.globalObject.get('Promise')
        );
      const species =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          evaluateScript(
            constructorRealm,
            'class ForeignSpecies extends Promise {} ForeignSpecies;',
          ).value
        );
      const speciesPrototype = /** @type {EngineObject} */ (
        species.get('prototype')
      );
      const then =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            callerRealm.intrinsics.promisePrototype
          ).get('then')
        );
      const speciesSymbol = constructorRealm.agent.wellKnownSymbols.species;
      let getterCalls = 0;
      let observedCallerRealm;
      const getter = accessorRealm.createNativeFunction({
        name: 'get [Symbol.species]',
        length: 0,
        call(_thisValue, _args, _functionObject, callerRealmArgument) {
          getterCalls += 1;
          observedCallerRealm = callerRealmArgument;
          return species;
        },
      });

      constructor.defineOwnProperty(
        speciesSymbol,
        {
          get: getter,
          enumerable: false,
          configurable: true,
        },
        true,
      );

      const child = promiseObject(
        then.callFunction(source, [undefined, undefined], callerRealm),
      );

      assertSame(getterCalls, 1);
      assertSame(observedCallerRealm, callerRealm);
      assertSame(child.realm, constructorRealm);
      assertSame(child.agent, constructorRealm.agent);
      assertSame(child.getPrototype(), speciesPrototype);

      let invalidGetterCalls = 0;
      constructor.defineOwnProperty(
        speciesSymbol,
        {
          get: accessorRealm.createNativeFunction({
            name: 'get [Symbol.species]',
            length: 0,
            call() {
              invalidGetterCalls += 1;
              return 1;
            },
          }),
          enumerable: false,
          configurable: true,
        },
        true,
      );
      const invalid = /** @type {ThrowSignal} */ (
        assertThrows(
          () => then.callFunction(source, [], callerRealm),
          ThrowSignal,
        )
      ).value;

      assertSame(invalidGetterCalls, 1);
      assertSame(
        /** @type {EngineObject} */ (invalid).getPrototype(),
        callerRealm.intrinsics.typeErrorPrototype,
      );

      let abruptGetterCalls = 0;
      const accessorError = accessorRealm.createGuestError(
        'TypeError',
        'foreign species getter failure',
      );
      constructor.defineOwnProperty(
        speciesSymbol,
        {
          get: accessorRealm.createNativeFunction({
            name: 'get [Symbol.species]',
            length: 0,
            call() {
              abruptGetterCalls += 1;
              throw new ThrowSignal(accessorError);
            },
          }),
          enumerable: false,
          configurable: true,
        },
        true,
      );
      const abrupt = /** @type {ThrowSignal} */ (
        assertThrows(
          () => then.callFunction(source, [], callerRealm),
          ThrowSignal,
        )
      );

      assertSame(abruptGetterCalls, 1);
      assertSame(abrupt.value, accessorError);
    },
  },
  {
    name: 'cross-Agent reactions run on the handler Agent and settle source-Agent children',
    run: () => {
      /** @type {Array<() => import('../src/runtime/jobs.js').JobDrainReport>} */
      const sourceCheckpoints = [];
      /** @type {Array<() => import('../src/runtime/jobs.js').JobDrainReport>} */
      const handlerCheckpoints = [];
      /** @type {Array<[unknown, 'reject' | 'handle']>} */
      const rejectionEvents = [];
      const sourceAgent = createAgent({
        jobHost: {
          scheduleMicrotask(checkpoint) {
            sourceCheckpoints.push(checkpoint);
          },
          promiseRejectionTracker(promise, operation) {
            rejectionEvents.push([promise, operation]);
          },
        },
      });
      const handlerAgent = createAgent({
        jobHost: {
          scheduleMicrotask(checkpoint) {
            handlerCheckpoints.push(checkpoint);
          },
        },
      });
      const sourceRealm = createRealm({ agent: sourceAgent });
      const handlerRealm = createRealm({ agent: handlerAgent });
      const fulfilled = promiseObject(
        evaluateScript(sourceRealm, 'Promise.resolve("fulfilled")').value,
      );
      const pending = createPendingPromise(sourceRealm, 'crossAgentPending');
      const rejected = promiseObject(
        evaluateScript(sourceRealm, 'Promise.reject("rejected")').value,
      );
      const then =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            sourceRealm.intrinsics.promisePrototype
          ).get('then')
        );
      const allocated = new EngineObject(
        handlerRealm.intrinsics.objectPrototype,
      );
      const hostError = new Error('cross-Agent handler host defect');
      /** @type {Array<import('../src/runtime/realm.js').Realm | null>} */
      const runningRealms = [];
      const normalHandler = handlerRealm.createNativeFunction({
        name: 'normalHandler',
        length: 1,
        call() {
          runningRealms.push(handlerAgent.currentJobRealm);
          return allocated;
        },
      });
      const pendingHandler = handlerRealm.createNativeFunction({
        name: 'pendingHandler',
        length: 1,
        call(_thisValue, args) {
          runningRealms.push(handlerAgent.currentJobRealm);
          return `${String(args[0])}-handled`;
        },
      });
      const rejectedHandler = handlerRealm.createNativeFunction({
        name: 'rejectedHandler',
        length: 1,
        call(_thisValue, args) {
          runningRealms.push(handlerAgent.currentJobRealm);
          return `${String(args[0])}-recovered`;
        },
      });
      const abruptHandler = handlerRealm.createNativeFunction({
        name: 'abruptHandler',
        length: 1,
        call() {
          runningRealms.push(handlerAgent.currentJobRealm);
          throw new GuestErrorSignal('TypeError', 'cross-Agent handler abrupt');
        },
      });
      const hostFailureHandler = handlerRealm.createNativeFunction({
        name: 'hostFailureHandler',
        length: 1,
        call() {
          runningRealms.push(handlerAgent.currentJobRealm);
          throw hostError;
        },
      });

      const normalChild = promiseObject(
        then.callFunction(fulfilled, [normalHandler], sourceRealm),
      );
      const abruptChild = promiseObject(
        then.callFunction(fulfilled, [abruptHandler], sourceRealm),
      );
      const hostFailureChild = promiseObject(
        then.callFunction(fulfilled, [hostFailureHandler], sourceRealm),
      );
      const pendingChild = promiseObject(
        then.callFunction(pending.promise, [pendingHandler], sourceRealm),
      );
      const rejectedChild = promiseObject(
        then.callFunction(rejected, [undefined, rejectedHandler], sourceRealm),
      );

      pending.resolve.callFunction(undefined, ['pending'], sourceRealm);
      assertSame(sourceCheckpoints.length, 0);
      assertSame(handlerCheckpoints.length, 1);
      assertSame(sourceAgent.checkpointState, 'idle');
      assertSame(handlerAgent.checkpointState, 'scheduled');
      const report = handlerCheckpoints[0]();

      assertSame(report.processed, 5);
      assertSame(report.failures.length, 1);
      assertSame(report.failures[0].job?.kind, 'promise-reaction');
      assertSame(report.failures[0].error, hostError);
      assertSame(
        runningRealms.every((realm) => realm === handlerRealm),
        true,
      );
      assertSame(normalChild.promiseState, 'fulfilled');
      assertSame(normalChild.promiseResult, allocated);
      assertSame(pendingChild.promiseState, 'fulfilled');
      assertSame(pendingChild.promiseResult, 'pending-handled');
      assertSame(rejectedChild.promiseState, 'fulfilled');
      assertSame(rejectedChild.promiseResult, 'rejected-recovered');
      assertSame(abruptChild.promiseState, 'rejected');
      assertSame(
        /** @type {EngineObject} */ (abruptChild.promiseResult).getPrototype(),
        handlerRealm.intrinsics.typeErrorPrototype,
      );
      assertSame(hostFailureChild.promiseState, 'pending');
      assertSame(sourceAgent.takeJobFailures().length, 0);
      const durableFailures = handlerAgent.takeJobFailures();
      assertSame(durableFailures.length, 1);
      assertSame(durableFailures[0].category, 'job');
      assertSame(durableFailures[0].error, hostError);
      assertSame(rejectionEvents.length, 3);
      assertSame(rejectionEvents[0][0], rejected);
      assertSame(rejectionEvents[0][1], 'reject');
      assertSame(rejectionEvents[1][0], rejected);
      assertSame(rejectionEvents[1][1], 'handle');
      assertSame(rejectionEvents[2][0], abruptChild);
      assertSame(rejectionEvents[2][1], 'reject');

      let observedReason;
      const localRejectHandler = sourceRealm.createNativeFunction({
        name: 'localRejectHandler',
        length: 1,
        call(_thisValue, args) {
          observedReason = args[0];
          return 'locally recovered';
        },
      });
      const recoveryChild = promiseObject(
        then.callFunction(
          abruptChild,
          [undefined, localRejectHandler],
          sourceRealm,
        ),
      );

      assertSame(sourceCheckpoints.length, 1);
      assertSame(handlerCheckpoints.length, 1);
      assertSame(rejectionEvents.length, 4);
      assertSame(rejectionEvents[3][0], abruptChild);
      assertSame(rejectionEvents[3][1], 'handle');
      assertSame(sourceCheckpoints[0]().failures.length, 0);
      assertSame(observedReason, abruptChild.promiseResult);
      assertSame(recoveryChild.promiseState, 'fulfilled');
      assertSame(recoveryChild.promiseResult, 'locally recovered');
    },
  },
  {
    name: 'cross-Agent thenable jobs run on the then Agent without losing settlement',
    run: () => {
      /** @type {Array<() => import('../src/runtime/jobs.js').JobDrainReport>} */
      const sourceCheckpoints = [];
      /** @type {Array<() => import('../src/runtime/jobs.js').JobDrainReport>} */
      const thenCheckpoints = [];
      /** @type {Array<[unknown, 'reject' | 'handle']>} */
      const rejectionEvents = [];
      const sourceAgent = createAgent({
        jobHost: {
          scheduleMicrotask(checkpoint) {
            sourceCheckpoints.push(checkpoint);
          },
          promiseRejectionTracker(promise, operation) {
            rejectionEvents.push([promise, operation]);
          },
        },
      });
      const thenAgent = createAgent({
        jobHost: {
          scheduleMicrotask(checkpoint) {
            thenCheckpoints.push(checkpoint);
          },
        },
      });
      const sourceRealm = createRealm({ agent: sourceAgent });
      const thenRealm = createRealm({ agent: thenAgent });
      const fulfilled = createPendingPromise(sourceRealm, 'thenableFulfilled');
      const rejected = createPendingPromise(sourceRealm, 'thenableRejected');
      const failed = createPendingPromise(sourceRealm, 'thenableFailed');
      const allocation = new EngineObject(thenRealm.intrinsics.objectPrototype);
      const hostError = new Error('cross-Agent thenable host defect');
      /** @type {Array<import('../src/runtime/realm.js').Realm | null>} */
      const runningRealms = [];
      const createThenable = (
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ then,
      ) => {
        const thenable = new EngineObject(thenRealm.intrinsics.objectPrototype);
        thenable.defineOwnProperty('then', {
          value: then,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        return thenable;
      };
      const fulfillingThenable = createThenable(
        thenRealm.createNativeFunction({
          name: 'then',
          length: 2,
          call(_thisValue, args) {
            runningRealms.push(thenAgent.currentJobRealm);
            return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
              args[0]
            ).callFunction(undefined, [allocation], thenRealm);
          },
        }),
      );
      const rejectingThenable = createThenable(
        thenRealm.createNativeFunction({
          name: 'then',
          length: 2,
          call() {
            runningRealms.push(thenAgent.currentJobRealm);
            throw new GuestErrorSignal(
              'TypeError',
              'cross-Agent thenable abrupt',
            );
          },
        }),
      );
      const failingThenable = createThenable(
        thenRealm.createNativeFunction({
          name: 'then',
          length: 2,
          call() {
            runningRealms.push(thenAgent.currentJobRealm);
            throw hostError;
          },
        }),
      );

      fulfilled.resolve.callFunction(
        undefined,
        [fulfillingThenable],
        sourceRealm,
      );
      rejected.resolve.callFunction(
        undefined,
        [rejectingThenable],
        sourceRealm,
      );
      failed.resolve.callFunction(undefined, [failingThenable], sourceRealm);

      assertSame(sourceCheckpoints.length, 0);
      assertSame(thenCheckpoints.length, 1);
      assertSame(sourceAgent.checkpointState, 'idle');
      assertSame(thenAgent.checkpointState, 'scheduled');
      const report = thenCheckpoints[0]();

      assertSame(report.processed, 3);
      assertSame(report.failures.length, 1);
      assertSame(report.failures[0].job?.kind, 'promise-resolve-thenable');
      assertSame(report.failures[0].error, hostError);
      assertSame(
        runningRealms.every((realm) => realm === thenRealm),
        true,
      );
      assertSame(fulfilled.promise.promiseState, 'fulfilled');
      assertSame(fulfilled.promise.promiseResult, allocation);
      assertSame(rejected.promise.promiseState, 'rejected');
      assertSame(
        /** @type {EngineObject} */ (
          rejected.promise.promiseResult
        ).getPrototype(),
        thenRealm.intrinsics.typeErrorPrototype,
      );
      assertSame(failed.promise.promiseState, 'pending');
      assertSame(sourceAgent.takeJobFailures().length, 0);
      const durableFailures = thenAgent.takeJobFailures();
      assertSame(durableFailures.length, 1);
      assertSame(durableFailures[0].category, 'job');
      assertSame(durableFailures[0].error, hostError);
      assertSame(rejectionEvents.length, 1);
      assertSame(rejectionEvents[0][0], rejected.promise);
      assertSame(rejectionEvents[0][1], 'reject');
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
    name: 'pending reaction abrupt lookup uses the settlement Realm',
    run: () => {
      const agent = createAgent();
      const settlementRealm = createRealm({ agent });
      const registrationRealm = createRealm({ agent });
      const lookupErrorRealm = createRealm({ agent });
      const observedJobRealms = observeReactionJobRealms(agent);
      const pending = createPendingPromise(settlementRealm, 'pending');
      const registrationThen =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            registrationRealm.intrinsics.promisePrototype
          ).get('then')
        );
      let handlerContext = null;
      const abruptHandler = {
        callFunction() {
          handlerContext = agent.currentJobRealm;
          throw new GuestErrorSignal('TypeError', 'handler failure');
        },
        getFunctionRealm() {
          return {
            type: 'throw',
            value: lookupErrorRealm.createGuestError(
              'TypeError',
              'lookup failure',
            ),
          };
        },
      };
      const child = promiseObject(
        registrationThen.callFunction(pending.promise, [abruptHandler]),
      );

      pending.resolve.callFunction(undefined, ['settled']);
      assertSame(agent.runJobs().failures.length, 0);
      assertSame(observedJobRealms.length, 1);
      assertSame(observedJobRealms[0], settlementRealm);
      assertSame(handlerContext, settlementRealm);
      assertSame(child.promiseState, 'rejected');
      assertSame(
        /** @type {EngineObject} */ (child.promiseResult).getPrototype(),
        settlementRealm.intrinsics.typeErrorPrototype,
      );
      assertSame(
        /** @type {EngineObject} */ (child.promiseResult).getPrototype() ===
          registrationRealm.intrinsics.typeErrorPrototype,
        false,
      );
      assertSame(
        /** @type {EngineObject} */ (child.promiseResult).getPrototype() ===
          lookupErrorRealm.intrinsics.typeErrorPrototype,
        false,
      );
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
    name: 'scheduler failure reports a rejection handle before manual reaction recovery',
    run: () => {
      const schedulerError = new Error('scheduler failed');
      /** @type {Array<'reject' | 'handle'>} */
      const events = [];
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {
            throw schedulerError;
          },
          promiseRejectionTracker(_promise, operation) {
            events.push(operation);
          },
        },
      });
      const rejected = promiseObject(
        evaluateScript(
          realm,
          'var rejected = Promise.reject("reason"); rejected;',
        ).value,
      );
      const then =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (realm.intrinsics.promisePrototype).get(
            'then',
          )
        );
      let calls = 0;
      const handler = realm.createNativeFunction({
        name: 'handler',
        length: 1,
        call() {
          calls += 1;
          return undefined;
        },
      });

      assertSame(
        assertThrows(
          () =>
            then.callFunction(rejected, [
              undefined,
              /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
                handler
              ),
            ]),
          Error,
        ),
        schedulerError,
      );
      assertSame(events.join(','), 'reject,handle');
      assertSame(rejected.promiseIsHandled, true);
      assertSame(realm.agent.checkpointState, 'idle');
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(calls, 1);
      assertSame(events.join(','), 'reject,handle');
    },
  },
  {
    name: 'rejection tracking handles once when its handle hook reenters then',
    run: () => {
      /** @type {Array<[unknown, 'reject' | 'handle']>} */
      const events = [];
      /** @type {PromiseObject | undefined} */
      let reentrantChild;
      let didReenter = false;
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {},
          promiseRejectionTracker(promise, operation) {
            events.push([promise, operation]);
            if (operation === 'handle' && !didReenter) {
              didReenter = true;
              const then =
                /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
                  /** @type {EngineObject} */ (promise).get('then')
                );
              const reentrantHandler = realm.createNativeFunction({
                name: 'reentrantHandler',
                length: 1,
                call(_thisValue, args) {
                  assertNormalValue(
                    evaluateScript(
                      realm,
                      `log.push("reentrant:" + ${JSON.stringify(args[0])});`,
                    ),
                    2,
                  );
                  return undefined;
                },
              });
              reentrantChild = promiseObject(
                then.callFunction(promise, [undefined, reentrantHandler]),
              );
            }
          },
        },
      });
      const rejected = promiseObject(
        evaluateScript(
          realm,
          [
            'var log = [];',
            'var rejected = Promise.reject("reason");',
            'var firstChild = rejected.then(undefined, function (reason) {',
            '  log.push("first:" + reason);',
            '});',
            'rejected;',
          ].join('\n'),
        ).value,
      );
      const firstChild = promiseObject(realm.globalObject.get('firstChild'));

      if (reentrantChild === undefined) {
        throw new Error('Expected the rejection tracker to attach a handler');
      }

      assertSame(events.length, 2);
      assertSame(events[0][0], rejected);
      assertSame(events[0][1], 'reject');
      assertSame(events[1][0], rejected);
      assertSame(events[1][1], 'handle');
      assertSame(rejected.promiseState, 'rejected');
      assertSame(rejected.promiseResult, 'reason');
      assertSame(firstChild.promiseState, 'pending');
      assertSame(reentrantChild.promiseState, 'pending');
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'log.join(",")'),
        'first:reason,reentrant:reason',
      );
      assertSame(firstChild.promiseState, 'fulfilled');
      assertSame(reentrantChild.promiseState, 'fulfilled');
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
