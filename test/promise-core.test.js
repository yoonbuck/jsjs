import { createAgent, createRealm, evaluateScript } from '../src/index.js';
import { ThrowSignal } from '../src/runtime/completion.js';
import { EngineObject } from '../src/runtime/object.js';
import { newPromiseCapability } from '../src/runtime/promise.js';
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
 * @returns {import('../src/runtime/promise.js').PromiseObject}
 */
function assertPromiseObject(value) {
  if (!(value instanceof EngineObject)) {
    throw new Error(`Expected a PromiseObject, got ${typeof value}`);
  }

  return /** @type {import('../src/runtime/promise.js').PromiseObject} */ (
    value
  );
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @returns {{
 *   promise: import('../src/runtime/promise.js').PromiseObject,
 *   resolve: import('../src/runtime/descriptors.js').CallableLike,
 *   reject: import('../src/runtime/descriptors.js').CallableLike,
 * }}
 */
function createPendingPromise(realm, name) {
  assertNormalValue(
    evaluateScript(
      realm,
      [
        `var ${name}Resolve;`,
        `var ${name}Reject;`,
        `var ${name} = new Promise(function (resolve, reject) {`,
        `  ${name}Resolve = resolve;`,
        `  ${name}Reject = reject;`,
        '});',
      ].join('\n'),
    ),
    undefined,
  );

  return {
    promise: assertPromiseObject(realm.globalObject.get(name)),
    resolve:
      /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
        realm.globalObject.get(`${name}Resolve`)
      ),
    reject:
      /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
        realm.globalObject.get(`${name}Reject`)
      ),
  };
}

/**
 * @param {import('../src/runtime/descriptors.js').CompletePropertyDescriptor | undefined} descriptor
 * @param {unknown} value
 * @param {boolean} writable
 * @param {boolean} enumerable
 * @param {boolean} configurable
 * @returns {void}
 */
function assertDataDescriptor(
  descriptor,
  value,
  writable,
  enumerable,
  configurable,
) {
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new Error('Expected a data descriptor');
  }

  assertSame(descriptor.value, value);
  assertSame(descriptor.writable, writable);
  assertSame(descriptor.enumerable, enumerable);
  assertSame(descriptor.configurable, configurable);
}

export default [
  {
    name: 'Promise constructor is construct-only and exposes ES2015 descriptors',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var p = new Promise(function (resolve) { resolve(42); });',
            'typeof Promise + ":" +',
            'Promise.length + ":" +',
            'Promise.name + ":" +',
            '(p instanceof Promise) + ":" +',
            '(Promise.prototype.constructor === Promise)',
          ].join('\n'),
        ),
        'function:1:Promise:true:true',
      );
      assertGuestTypeError(
        realm,
        evaluateScript(realm, 'Promise(function(){})'),
      );
      assertGuestTypeError(realm, evaluateScript(realm, 'new Promise(1)'));

      const constructor = /** @type {EngineObject} */ (
        realm.globalObject.get('Promise')
      );
      const prototype = /** @type {EngineObject} */ (
        constructor.get('prototype')
      );
      assertDataDescriptor(
        realm.globalObject.getOwnProperty('Promise'),
        constructor,
        true,
        false,
        true,
      );
      assertDataDescriptor(
        constructor.getOwnProperty('length'),
        1,
        false,
        false,
        true,
      );
      assertDataDescriptor(
        constructor.getOwnProperty('name'),
        'Promise',
        false,
        false,
        true,
      );
      assertDataDescriptor(
        constructor.getOwnProperty('prototype'),
        prototype,
        false,
        false,
        false,
      );
      assertDataDescriptor(
        prototype.getOwnProperty('constructor'),
        constructor,
        true,
        false,
        true,
      );
    },
  },
  {
    name: 'Promise Symbol intrinsic properties expose exact descriptors and getter name',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var tag = Object.getOwnPropertyDescriptor(',
            '  Promise.prototype, Symbol.toStringTag',
            ');',
            'var species = Object.getOwnPropertyDescriptor(Promise, Symbol.species);',
            'Promise.prototype[Symbol.toStringTag] + ":" +',
            'tag.writable + ":" + tag.enumerable + ":" + tag.configurable + ":" +',
            'species.get.name + ":" + (species.set === undefined) + ":" +',
            'species.enumerable + ":" + species.configurable;',
          ].join('\n'),
        ),
        'Promise:false:false:true:get [Symbol.species]:true:false:true',
      );
    },
  },
  {
    name: 'Promise constructs with the requested newTarget prototype',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'class SubPromise extends Promise {',
            '  constructor(executor) { super(executor); }',
            '}',
            'var value = new SubPromise(function () {});',
            'value instanceof SubPromise;',
          ].join('\n'),
        ),
        true,
      );
    },
  },
  {
    name: 'Promise uses the foreign newTarget Realm intrinsic for invalid prototypes',
    run: () => {
      const agent = createAgent();
      const constructorRealm = createRealm({ agent });
      const newTargetRealm = createRealm({ agent });
      const promiseConstructor =
        /** @type {import('../src/builtins/shared.js').NativeFunction} */ (
          constructorRealm.globalObject.get('Promise')
        );
      const executor = constructorRealm.createNativeFunction({
        name: 'executor',
        length: 2,
        call() {
          return undefined;
        },
      });

      for (const prototype of ['null', '1']) {
        const foreignNewTarget =
          /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
            evaluateScript(
              newTargetRealm,
              `function Foreign(executor) {} Foreign.prototype = ${prototype}; Foreign;`,
            ).value
          );
        const promise = assertPromiseObject(
          promiseConstructor.constructFunction([executor], foreignNewTarget),
        );

        assertSame(
          promise.getPrototype(),
          newTargetRealm.intrinsics.promisePrototype,
        );
        assertSame(
          promise.getPrototype() ===
            constructorRealm.intrinsics.promisePrototype,
          false,
        );
      }

      const abruptNewTarget =
        /** @type {import('../src/runtime/function-object.js').EngineFunction & {
         *   getFunctionRealm: () => { type: 'throw', value: unknown },
         * }} */ (
          evaluateScript(
            newTargetRealm,
            'function Abrupt(executor) {} Abrupt.prototype = 1; Abrupt;',
          ).value
        );
      const abrupt = newTargetRealm.createGuestError(
        'TypeError',
        'abrupt newTarget Realm lookup',
      );
      abruptNewTarget.getFunctionRealm = () => ({
        type: 'throw',
        value: abrupt,
      });

      assertSame(
        /** @type {ThrowSignal} */ (
          assertThrows(
            () =>
              promiseConstructor.constructFunction([executor], abruptNewTarget),
            ThrowSignal,
          )
        ).value,
        abrupt,
      );
    },
  },
  {
    name: 'Promise internal Agent follows newTarget allocation despite a foreign prototype',
    run: () => {
      const baseRealm = createRealm();
      const allocationRealm = createRealm();
      const prototypeRealm = createRealm();
      const promiseConstructor =
        /** @type {import('../src/builtins/shared.js').NativeFunction} */ (
          baseRealm.globalObject.get('Promise')
        );
      const newTarget =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          evaluateScript(allocationRealm, 'function Sub(executor) {} Sub;')
            .value
        );
      const foreignPrototype = new EngineObject(
        prototypeRealm.intrinsics.objectPrototype,
      );
      const executor = baseRealm.createNativeFunction({
        name: 'executor',
        length: 2,
        call() {
          return undefined;
        },
      });

      newTarget.defineOwnProperty(
        'prototype',
        { value: foreignPrototype },
        true,
        allocationRealm,
      );
      const promise = assertPromiseObject(
        promiseConstructor.constructFunction(
          [executor],
          newTarget,
          allocationRealm,
        ),
      );

      assertSame(promise.realm, allocationRealm);
      assertSame(promise.agent, allocationRealm.agent);
      assertSame(promise.getPrototype(), foreignPrototype);
      assertSame(promise.agent === prototypeRealm.agent, false);
    },
  },
  {
    name: 'newPromiseCapability accepts a conforming constructor result',
    run: () => {
      const realm = createRealm();
      const result = new EngineObject(realm.intrinsics.objectPrototype);
      const resolve = realm.createNativeFunction({
        name: 'resolve',
        length: 1,
        call() {
          return undefined;
        },
      });
      const reject = realm.createNativeFunction({
        name: 'reject',
        length: 1,
        call() {
          return undefined;
        },
      });
      const constructor = realm.createNativeFunction({
        name: 'CapabilityConstructor',
        length: 1,
        prototype: new EngineObject(realm.intrinsics.objectPrototype),
        call() {
          return undefined;
        },
        construct(args) {
          /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            args[0]
          ).callFunction(undefined, [resolve, reject]);
          return result;
        },
      });

      const capability = newPromiseCapability(constructor, realm);
      assertSame(capability.promise, result);
      assertSame(capability.resolve, resolve);
      assertSame(capability.reject, reject);
    },
  },
  {
    name: 'Promise executor runs synchronously, resolving functions return undefined, and settle once',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var log = [];',
            'var returns = [];',
            'var p = new Promise(function (resolve, reject) {',
            '  log.push("executor");',
            '  returns.push(resolve("first"));',
            '  returns.push(reject("second"));',
            '  returns.push(resolve("third"));',
            '});',
            'log.push("after");',
            '(returns[0] === undefined) + ":" +',
            '(returns[1] === undefined) + ":" +',
            '(returns[2] === undefined) + ":" + log.join(",");',
          ].join('\n'),
        ),
        'true:true:true:executor,after',
      );
      const promise = assertPromiseObject(realm.globalObject.get('p'));
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'first');
    },
  },
  {
    name: 'Promise converts an executor abrupt completion into rejection',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          'var p = new Promise(function () { throw "executor"; }); p;',
        ).value,
      );

      assertSame(promise.promiseState, 'rejected');
      assertSame(promise.promiseResult, 'executor');
    },
  },
  {
    name: 'Promise keeps a thenable resolution when its executor later throws',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var p = new Promise(function (resolve) {',
            '  resolve({ then: function (resolve) { resolve("resolved"); } });',
            '  throw "executor";',
            '});',
            'p;',
          ].join('\n'),
        ).value,
      );

      assertSame(promise.promiseState, 'pending');
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'resolved');
    },
  },
  {
    name: 'Promise resolving functions reject self-resolution with their Realm TypeError',
    run: () => {
      const realm = createRealm();
      const { promise, resolve } = createPendingPromise(realm, 'self');

      assertSame(resolve.callFunction(undefined, [promise]), undefined);
      assertSame(promise.promiseState, 'rejected');
      assertSame(
        /** @type {EngineObject} */ (promise.promiseResult).getPrototype(),
        realm.intrinsics.typeErrorPrototype,
      );
    },
  },
  {
    name: 'Promise resolving functions fulfill primitives and objects with non-callable then',
    run: () => {
      const realm = createRealm();
      const primitive = createPendingPromise(realm, 'primitive');
      const plain = createPendingPromise(realm, 'plain');
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      object.defineOwnProperty('then', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      primitive.resolve.callFunction(undefined, [7]);
      plain.resolve.callFunction(undefined, [object]);

      assertSame(primitive.promise.promiseState, 'fulfilled');
      assertSame(primitive.promise.promiseResult, 7);
      assertSame(plain.promise.promiseState, 'fulfilled');
      assertSame(plain.promise.promiseResult, object);
    },
  },
  {
    name: 'Promise rejects a throwing then getter',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var getterError = new Error("then getter");',
            'var thenable = {};',
            'Object.defineProperty(thenable, "then", {',
            '  get: function () { throw getterError; }',
            '});',
            'var p = new Promise(function (resolve) { resolve(thenable); });',
            'p;',
          ].join('\n'),
        ).value,
      );

      assertSame(promise.promiseState, 'rejected');
      assertSame(promise.promiseResult, realm.globalObject.get('getterError'));
    },
  },
  {
    name: 'Promise observes an own throwing then getter before adopting a Promise',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var source = new Promise(function (resolve) { resolve("source"); });',
            'var ownThenError = new Error("own then getter");',
            'Object.defineProperty(source, "then", {',
            '  get: function () { throw ownThenError; }',
            '});',
            'var target = new Promise(function (resolve) { resolve(source); });',
            'target;',
          ].join('\n'),
        ).value,
      );

      assertSame(promise.promiseState, 'rejected');
      assertSame(promise.promiseResult, realm.globalObject.get('ownThenError'));
    },
  },
  {
    name: 'Promise fulfills with a Promise that has an own non-callable then',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var source = new Promise(function (resolve) { resolve("source"); });',
            'source.then = 1;',
            'var target = new Promise(function (resolve) { resolve(source); });',
            'target;',
          ].join('\n'),
        ).value,
      );

      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, realm.globalObject.get('source'));
    },
  },
  {
    name: 'Promise enqueues an own callable then before temporary Promise adoption',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var source = new Promise(function (resolve) { resolve("source"); });',
            'source.then = function (resolve) { resolve("own then"); };',
            'var target = new Promise(function (resolve) { resolve(source); });',
            'target;',
          ].join('\n'),
        ).value,
      );

      assertSame(promise.promiseState, 'pending');
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'own then');
    },
  },
  {
    name: 'Promise defers callable thenables and honors their one-shot resolve cell',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var calls = 0;',
            'var p = new Promise(function (resolve) {',
            '  resolve({',
            '    then: function (resolve, reject) {',
            '      calls = calls + 1;',
            '      resolve("first");',
            '      reject("second");',
            '      resolve("third");',
            '    }',
            '  });',
            '});',
            'p;',
          ].join('\n'),
        ).value,
      );

      assertSame(promise.promiseState, 'pending');
      assertNormalValue(evaluateScript(realm, 'calls;'), 0);
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'calls;'), 1);
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'first');
    },
  },
  {
    name: 'Promise adoption observes the intrinsic then and preserves identity',
    run: () => {
      const realm = createRealm();
      const pendingSource = createPendingPromise(realm, 'pendingSource');
      const pendingTarget = createPendingPromise(realm, 'pendingTarget');
      const fulfilledSource = assertPromiseObject(
        evaluateScript(
          realm,
          'var fulfilledSource = new Promise(function (resolve) { resolve("yes"); }); fulfilledSource;',
        ).value,
      );
      const fulfilledTarget = createPendingPromise(realm, 'fulfilledTarget');
      const rejectedSource = assertPromiseObject(
        evaluateScript(
          realm,
          'var rejectedSource = new Promise(function (resolve, reject) { reject("no"); }); rejectedSource;',
        ).value,
      );
      const rejectedTarget = createPendingPromise(realm, 'rejectedTarget');

      pendingTarget.resolve.callFunction(undefined, [pendingSource.promise]);
      fulfilledTarget.resolve.callFunction(undefined, [fulfilledSource]);
      rejectedTarget.resolve.callFunction(undefined, [rejectedSource]);

      assertSame(pendingTarget.promise === pendingSource.promise, false);
      assertSame(pendingTarget.promise.promiseState, 'pending');
      assertSame(fulfilledTarget.promise.promiseState, 'pending');
      assertSame(rejectedTarget.promise.promiseState, 'pending');

      pendingSource.resolve.callFunction(undefined, ['later']);
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertSame(pendingTarget.promise.promiseState, 'fulfilled');
      assertSame(pendingTarget.promise.promiseResult, 'later');
      assertSame(fulfilledTarget.promise.promiseState, 'fulfilled');
      assertSame(fulfilledTarget.promise.promiseResult, 'yes');
      assertSame(rejectedTarget.promise.promiseState, 'rejected');
      assertSame(rejectedTarget.promise.promiseResult, 'no');
    },
  },
  {
    name: 'Promise thenable jobs use the then callback Realm',
    run: () => {
      const agent = createAgent();
      const realm = createRealm({ agent });
      const foreignRealm = createRealm({ agent });
      const { promise, resolve } = createPendingPromise(realm, 'target');
      let observedRealm = null;
      const then = foreignRealm.createNativeFunction({
        name: 'then',
        length: 2,
        call(_thisValue, args) {
          observedRealm = agent.currentJobRealm;
          return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            args[0]
          ).callFunction(undefined, ['foreign']);
        },
      });
      const thenable = new EngineObject(realm.intrinsics.objectPrototype);
      thenable.defineOwnProperty('then', {
        value: then,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      resolve.callFunction(undefined, [thenable]);
      assertSame(promise.promiseState, 'pending');
      assertSame(agent.runJobs().failures.length, 0);
      assertSame(observedRealm, foreignRealm);
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'foreign');
    },
  },
  {
    name: 'Promise thenable jobs use the lookup Realm after abrupt GetFunctionRealm',
    run: () => {
      const agent = createAgent();
      const realm = createRealm({ agent });
      const { promise, resolve } = createPendingPromise(realm, 'target');
      let observedRealm = null;
      const abruptThen = {
        /**
         * @param {unknown} _thisValue
         * @param {readonly unknown[]} args
         * @returns {unknown}
         */
        callFunction(_thisValue, args) {
          observedRealm = agent.currentJobRealm;
          return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            args[0]
          ).callFunction(undefined, ['fallback']);
        },
        getFunctionRealm() {
          return {
            type: 'throw',
            value: realm.createGuestError('TypeError', 'abrupt lookup'),
          };
        },
      };
      const thenable = new EngineObject(realm.intrinsics.objectPrototype);
      thenable.defineOwnProperty('then', {
        value: abruptThen,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      resolve.callFunction(undefined, [thenable]);
      assertSame(agent.runJobs().failures.length, 0);
      assertSame(observedRealm, realm);
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'fallback');
    },
  },
  {
    name: 'Promise thenable jobs guard a malformed normal Realm lookup from creating a null-Realm job',
    run: () => {
      const agent = createAgent();
      const realm = createRealm({ agent });
      const { promise, resolve } = createPendingPromise(realm, 'target');
      let observedRealm = null;
      const malformedThen = {
        /**
         * @param {unknown} _thisValue
         * @param {readonly unknown[]} args
         * @returns {unknown}
         */
        callFunction(_thisValue, args) {
          observedRealm = agent.currentJobRealm;
          return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            args[0]
          ).callFunction(undefined, ['fallback']);
        },
        getFunctionRealm() {
          return { type: 'normal', value: null };
        },
      };
      const thenable = new EngineObject(realm.intrinsics.objectPrototype);
      thenable.defineOwnProperty('then', {
        value: malformedThen,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      resolve.callFunction(undefined, [thenable]);
      assertSame(agent.runJobs().failures.length, 0);
      assertSame(observedRealm, realm);
      assertSame(promise.promiseState, 'fulfilled');
      assertSame(promise.promiseResult, 'fallback');
    },
  },
  {
    name: 'Promise thenable job abrupt completion rejects instead of failing the Agent job',
    run: () => {
      const realm = createRealm();
      const promise = assertPromiseObject(
        evaluateScript(
          realm,
          [
            'var p = new Promise(function (resolve) {',
            '  resolve({ then: function () { throw "then failure"; } });',
            '});',
            'p;',
          ].join('\n'),
        ).value,
      );

      const report = realm.agent.runJobs();
      assertSame(report.failures.length, 0);
      assertSame(promise.promiseState, 'rejected');
      assertSame(promise.promiseResult, 'then failure');
    },
  },
];
