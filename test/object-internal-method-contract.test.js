import { assertSame, assertThrows } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { createModuleLoader } from '../src/runtime/module-loader.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import { linkModuleGraph } from '../src/runtime/module-linker.js';
import { evaluateModuleGraph } from '../src/evaluator/modules.js';
import { EngineObject } from '../src/runtime/object.js';
import * as objectOperations from '../src/runtime/object.js';
import { ThrowSignal, GuestErrorSignal } from '../src/runtime/completion.js';
import { GeneratorObject } from '../src/runtime/generator-object.js';
import { typeOf } from '../src/runtime/operators.js';
import {
  callCallable,
  constructCallable,
  isCallable,
  isConstructor,
} from '../src/runtime/capabilities.js';
import { createAbruptRealmCallable } from '../src/runtime/function-realm.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {Promise<import('../src/runtime/module-record.js').SourceTextModuleRecord>}
 */
async function linkedModule(realm, source) {
  const loader = createModuleLoader(realm, {
    resolve(specifier) {
      return specifier;
    },
    load(identifier) {
      if (identifier !== 'entry') {
        throw new Error(`Unexpected module ${identifier}`);
      }

      return source;
    },
  });
  const record = await loadModuleGraph(loader, 'entry');
  linkModuleGraph(record);
  return record;
}

export default [
  {
    name: 'Table 5 metadata methods return booleans and wrappers own failure',
    run() {
      const object = new EngineObject();
      const descriptor = {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      };

      assertSame(object.preventExtensions(), true);
      assertSame(object.isExtensible(), false);
      assertSame(
        /** @type {any} */ (object).defineOwnProperty('new', descriptor, true),
        false,
      );
      assertSame(/** @type {any} */ (object).delete('missing', true), true);
      assertSame(typeof objectOperations.defineOwnPropertyOrThrow, 'function');
      assertThrows(
        () =>
          objectOperations.defineOwnPropertyOrThrow(object, 'new', descriptor),
        GuestErrorSignal,
      );
    },
  },
  {
    name: 'public descriptors are detached from ordinary storage',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const descriptor = object.getOwnProperty('value');
      if (descriptor === undefined) {
        throw new Error('Expected an own descriptor');
      }
      descriptor.value = 2;

      assertSame(object.get('value'), 1);
    },
  },
  {
    name: 'raw engine accessors remain non-callable after descriptor reflection',
    run() {
      const realm = createRealm();
      const rawAccessor = () => 'host-only';

      realm.globalObject.defineOwnProperty('engineAccessor', {
        get: rawAccessor,
        enumerable: false,
        configurable: true,
      });

      const reflected = evaluateScript(
        realm,
        'Object.getOwnPropertyDescriptor(this, "engineAccessor").get;',
      ).value;

      assertSame(reflected, rawAccessor);
      assertSame(isCallable(reflected), false);
      assertSame(typeOf(reflected), 'object');
      assertThrows(
        () => callCallable(reflected, undefined, []),
        GuestErrorSignal,
      );
      assertSame(
        evaluateScript(
          realm,
          'typeof Object.getOwnPropertyDescriptor(this, "engineAccessor").get;',
        ).value,
        'object',
      );
      assertSame(
        evaluateScript(
          realm,
          'var getter = Object.getOwnPropertyDescriptor(this, "engineAccessor").get; var error; try { getter(); } catch (caught) { error = caught.name; } error;',
        ).value,
        'TypeError',
      );
    },
  },
  {
    name: 'Table 6 capabilities reject spoofed methods, tags, and constructor flags',
    run() {
      const realm = createRealm();
      const impostor = new EngineObject();
      const guest = evaluateScript(realm, '(function normal() {})').value;
      const native = realm.createNativeFunction({
        name: 'Native',
        length: 0,
        call() {
          return undefined;
        },
        construct() {
          return new EngineObject(realm.intrinsics.objectPrototype);
        },
      });
      const arrow = evaluateScript(realm, '(() => undefined)').value;
      const generator = evaluateScript(realm, '(function* values() {})').value;
      const abrupt = createAbruptRealmCallable(realm, undefined);

      /** @type {any} */ (impostor).callFunction = () => 'spoofed call';
      /** @type {any} */ (impostor).constructFunction = () =>
        new EngineObject();
      /** @type {any} */ (impostor)._isConstructor = true;
      /** @type {any} */ (impostor).getClassName = () => 'Function';

      assertSame(isCallable(impostor), false);
      assertSame(isConstructor(impostor), false);
      assertThrows(
        () => callCallable(impostor, undefined, []),
        GuestErrorSignal,
      );
      assertThrows(
        () => constructCallable(impostor, [], impostor),
        GuestErrorSignal,
      );

      for (const [value, callable, constructor] of [
        [guest, true, true],
        [native, true, true],
        [arrow, true, false],
        [generator, true, false],
        [realm.intrinsics.functionPrototype, true, false],
        [abrupt, true, false],
      ]) {
        assertSame(isCallable(value), callable);
        assertSame(isConstructor(value), constructor);
      }
    },
  },
  {
    name: 'active execution Realm nests and restores in finally paths',
    run() {
      const outer = createRealm();
      const inner = createRealm({ agent: outer.agent });
      const agent = outer.agent;

      agent.withActiveExecutionRealm(outer, () => {
        assertSame(agent.activeExecutionRealm, outer);
        assertThrows(() => {
          agent.withActiveExecutionRealm(inner, () => {
            assertSame(agent.activeExecutionRealm, inner);
            throw new RangeError('restore');
          });
        }, RangeError);
        assertSame(agent.activeExecutionRealm, outer);
      });
      assertSame(agent.activeExecutionRealm, null);
      assertThrows(
        () => agent.withActiveExecutionRealm(createRealm(), () => {}),
        TypeError,
      );
    },
  },
  {
    name: 'active execution Realm rejects registered fake Realms',
    run() {
      const agent = createAgent();
      const fakeRealm = { agent };
      let callbackRan = false;

      agent.registerRealm(fakeRealm);

      assertThrows(
        () =>
          agent.withActiveExecutionRealm(/** @type {any} */ (fakeRealm), () => {
            callbackRan = true;
          }),
        TypeError,
      );
      assertSame(callbackRan, false);
      assertSame(agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'active execution Realm rejects reassigned Realm frames and blocks linking',
    run() {
      const sourceAgent = createAgent();
      const sourceRealm = createRealm({ agent: sourceAgent });
      const targetAgent = createAgent();
      const targetRealm = createRealm({ agent: targetAgent });
      let linkedCallbackRan = false;
      let callbackRan = false;

      sourceAgent.withActiveExecutionRealm(sourceRealm, () => {
        const chain = sourceAgent.enterGeneratorHostChain();

        try {
          sourceAgent.linkGeneratorHostChain(targetAgent);
          sourceRealm.agent = targetAgent;
          assertThrows(
            () =>
              targetAgent.withLinkedActiveExecutionRealm(sourceAgent, () => {
                linkedCallbackRan = true;
              }),
            TypeError,
          );
          assertSame(linkedCallbackRan, false);
          assertSame(targetAgent.activeExecutionRealm, null);
        } finally {
          sourceRealm.agent = sourceAgent;
          sourceAgent.exitGeneratorHostChain(chain);
        }
      });

      sourceRealm.agent = targetAgent;
      try {
        assertThrows(
          () =>
            sourceAgent.withActiveExecutionRealm(sourceRealm, () => {
              callbackRan = true;
            }),
          TypeError,
        );
      } finally {
        sourceRealm.agent = sourceAgent;
      }
      assertSame(callbackRan, false);
      assertSame(sourceAgent.activeExecutionRealm, null);
      assertSame(targetRealm.agent, targetAgent);
    },
  },
  {
    name: 'Realm-bearing jobs push their Realm while Realm-null jobs expose none',
    run() {
      const realm = createRealm();
      /** @type {(import('../src/runtime/realm.js').Realm | null)[]} */
      const observed = [];

      realm.agent.enqueueJob({
        realm,
        kind: 'realm-job',
        arguments: [],
        callback() {
          observed.push(realm.agent.activeExecutionRealm);
          return { type: 'normal', value: undefined };
        },
      });
      realm.agent.enqueueJob({
        realm: null,
        kind: 'host-job',
        arguments: [],
        callback() {
          observed.push(realm.agent.activeExecutionRealm);
          return { type: 'normal', value: undefined };
        },
      });
      realm.agent.withActiveExecutionRealm(realm, () => {
        realm.agent.runJobs();
        assertSame(realm.agent.activeExecutionRealm, realm);
      });

      assertSame(observed[0], realm);
      assertSame(observed[1], null);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'job execution restores its active Realm after an abrupt callback',
    run() {
      const realm = createRealm();

      realm.agent.enqueueJob({
        realm,
        kind: 'abrupt-realm-job',
        arguments: [],
        callback() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          throw new RangeError('job');
        },
      });

      assertSame(realm.agent.runJobs().failures.length, 1);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'evaluateScript pushes and restores its execution Realm',
    run() {
      const realm = createRealm();
      const observe = realm.createNativeFunction({
        name: 'observe',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          return 1;
        },
      });
      const explode = realm.createNativeFunction({
        name: 'explode',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          throw new RangeError('script');
        },
      });

      realm.globalObject.defineOwnProperty('observe', {
        value: observe,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('explode', {
        value: explode,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(evaluateScript(realm, 'observe();').value, 1);
      assertSame(realm.agent.activeExecutionRealm, null);
      assertThrows(() => evaluateScript(realm, 'explode();'), RangeError);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'module evaluation pushes and restores its execution Realm',
    async run() {
      const realm = createRealm();
      const observe = realm.createNativeFunction({
        name: 'observe',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          return 1;
        },
      });
      const explode = realm.createNativeFunction({
        name: 'explode',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          throw new RangeError('module');
        },
      });

      realm.globalObject.defineOwnProperty('observe', {
        value: observe,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realm.globalObject.defineOwnProperty('explode', {
        value: explode,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      evaluateModuleGraph(
        await linkedModule(realm, 'export const value = observe();'),
      );
      assertSame(realm.agent.activeExecutionRealm, null);
      const abruptRecord = await linkedModule(realm, 'explode();');
      assertThrows(() => evaluateModuleGraph(abruptRecord), RangeError);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'guest calls push their function Realm and restore it after completion',
    run() {
      const realm = createRealm();
      const observe = realm.createNativeFunction({
        name: 'observe',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
        },
      });

      realm.globalObject.defineOwnProperty('observe', {
        value: observe,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const normal =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          evaluateScript(realm, '(function normal() { observe(); return 1; })')
            .value
        );
      const abrupt =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          evaluateScript(realm, '(function abrupt() { observe(); throw 1; })')
            .value
        );

      assertSame(normal.callFunction(undefined, []), 1);
      assertSame(realm.agent.activeExecutionRealm, null);
      assertThrows(() => abrupt.callFunction(undefined, []), ThrowSignal);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'class-call rejection runs in its function Realm',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const functionRealm = createRealm({ agent: createAgent() });
      /** @type {import('../src/runtime/realm.js').Realm | null} */
      let observed = null;
      const createGuestError = functionRealm.createGuestError;
      functionRealm.createGuestError = (typeName, message) => {
        observed = functionRealm.agent.activeExecutionRealm;
        return createGuestError.call(functionRealm, typeName, message);
      };
      const classConstructor =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          evaluateScript(functionRealm, '(class C {})').value
        );

      callerRealm.agent.withActiveExecutionRealm(callerRealm, () => {
        assertThrows(
          () => classConstructor.callFunction(undefined, [], callerRealm),
          ThrowSignal,
        );
        assertSame(callerRealm.agent.activeExecutionRealm, callerRealm);
      });

      assertSame(observed, functionRealm);
      assertSame(functionRealm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'native calls and construction push their function Realm and restore it',
    run() {
      const realm = createRealm();
      const native = realm.createNativeFunction({
        name: 'native',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          return 1;
        },
        construct() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          return new EngineObject(realm.intrinsics.objectPrototype);
        },
      });
      const abrupt = realm.createNativeFunction({
        name: 'abrupt',
        length: 0,
        call() {
          assertSame(realm.agent.activeExecutionRealm, realm);
          throw new RangeError('native');
        },
      });

      assertSame(native.callFunction(undefined, []), 1);
      assertSame(realm.agent.activeExecutionRealm, null);
      assertSame(
        /** @type {EngineObject} */ (
          native.constructFunction([])
        ).getPrototype(),
        realm.intrinsics.objectPrototype,
      );
      assertSame(realm.agent.activeExecutionRealm, null);
      assertThrows(() => abrupt.callFunction(undefined, []), RangeError);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'cross-Agent guest and native calls preserve both execution contexts',
    run() {
      const source = createRealm({ agent: createAgent() });
      const target = createRealm({ agent: createAgent() });
      const observe = target.createNativeFunction({
        name: 'observe',
        length: 0,
        call() {
          assertSame(source.agent.activeExecutionRealm, source);
          assertSame(target.agent.activeExecutionRealm, target);
          return 11;
        },
      });
      const native = target.createNativeFunction({
        name: 'native',
        length: 0,
        call() {
          assertSame(source.agent.activeExecutionRealm, source);
          assertSame(target.agent.activeExecutionRealm, target);
          return 22;
        },
      });
      const abrupt = target.createNativeFunction({
        name: 'abrupt',
        length: 0,
        call() {
          assertSame(source.agent.activeExecutionRealm, source);
          assertSame(target.agent.activeExecutionRealm, target);
          throw new RangeError('cross-Agent');
        },
      });
      const constructor = target.createNativeFunction({
        name: 'Constructor',
        length: 0,
        call() {
          return undefined;
        },
        construct() {
          assertSame(source.agent.activeExecutionRealm, source);
          assertSame(target.agent.activeExecutionRealm, target);
          return new EngineObject(target.intrinsics.objectPrototype);
        },
      });

      target.globalObject.defineOwnProperty('observe', {
        value: observe,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const guest =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          evaluateScript(target, '(function guest() { return observe(); })')
            .value
        );
      for (const [name, value] of /** @type {[string, unknown][]} */ ([
        ['guest', guest],
        ['native', native],
        ['abrupt', abrupt],
        ['Constructor', constructor],
      ])) {
        source.globalObject.defineOwnProperty(name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      assertSame(evaluateScript(source, 'guest();').value, 11);
      assertSame(evaluateScript(source, 'native();').value, 22);
      assertSame(evaluateScript(source, 'new Constructor();').type, 'normal');
      assertThrows(() => evaluateScript(source, 'abrupt();'), RangeError);
      assertSame(source.agent.activeExecutionRealm, null);
      assertSame(target.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'generator resume pushes its generator Realm and restores it',
    run() {
      const realm = createRealm();
      const normal = new GeneratorObject(
        realm,
        realm.intrinsics.objectPrototype,
        {
          resume() {
            assertSame(realm.agent.activeExecutionRealm, realm);
            return {
              type: 'complete',
              completion: { type: 'normal', value: undefined },
            };
          },
        },
      );
      const abrupt = new GeneratorObject(
        realm,
        realm.intrinsics.objectPrototype,
        {
          resume() {
            assertSame(realm.agent.activeExecutionRealm, realm);
            throw new RangeError('generator');
          },
        },
      );

      assertSame(
        normal.resume({ type: 'normal', value: undefined }).get('done'),
        true,
      );
      assertSame(realm.agent.activeExecutionRealm, null);
      assertThrows(
        () => abrupt.resume({ type: 'normal', value: undefined }),
        RangeError,
      );
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'a native generator method nests its generator Realm while resuming',
    run() {
      const generatorRealm = createRealm({ agent: createAgent() });
      const methodRealm = createRealm({ agent: createAgent() });
      const observe = generatorRealm.createNativeFunction({
        name: 'observe',
        length: 0,
        call() {
          assertSame(generatorRealm.agent.activeExecutionRealm, generatorRealm);
          assertSame(methodRealm.agent.activeExecutionRealm, methodRealm);
          return 1;
        },
      });

      generatorRealm.globalObject.defineOwnProperty('observe', {
        value: observe,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const generator = /** @type {EngineObject} */ (
        evaluateScript(
          generatorRealm,
          '(function* values() { yield observe(); })()',
        ).value
      );
      const next =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            methodRealm.intrinsics.generatorPrototype
          ).get('next')
        );

      const result = /** @type {EngineObject} */ (
        next.callFunction(generator, [], methodRealm)
      );
      assertSame(result.get('value'), 1);
      assertSame(generatorRealm.agent.activeExecutionRealm, null);
      assertSame(methodRealm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'linked Agents copy execution context only while their callback runs',
    run() {
      const sourceAgent = createAgent();
      const sourceRealm = createRealm({ agent: sourceAgent });
      const targetAgent = createAgent();
      const targetRealm = createRealm({ agent: targetAgent });
      let rejectedCallbackRan = false;

      assertThrows(
        () =>
          targetAgent.withLinkedActiveExecutionRealm(sourceAgent, () => {
            rejectedCallbackRan = true;
          }),
        TypeError,
      );
      assertSame(rejectedCallbackRan, false);

      sourceAgent.withActiveExecutionRealm(sourceRealm, () => {
        const chain = sourceAgent.enterGeneratorHostChain();

        try {
          sourceAgent.linkGeneratorHostChain(targetAgent);
          targetAgent.withLinkedActiveExecutionRealm(sourceAgent, () => {
            assertSame(targetAgent.activeExecutionRealm, sourceRealm);
          });
          assertSame(targetAgent.activeExecutionRealm, null);
          assertThrows(
            () =>
              targetAgent.withLinkedActiveExecutionRealm(sourceAgent, () => {
                assertSame(targetAgent.activeExecutionRealm, sourceRealm);
                throw new RangeError('linked restore');
              }),
            RangeError,
          );
          assertSame(targetAgent.activeExecutionRealm, null);
          sourceAgent.withNoActiveExecutionRealm(() => {
            targetAgent.withLinkedActiveExecutionRealm(sourceAgent, () => {
              assertSame(targetAgent.activeExecutionRealm, null);
            });
          });
        } finally {
          sourceAgent.exitGeneratorHostChain(chain);
        }
      });

      assertSame(sourceAgent.activeExecutionRealm, null);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(targetRealm.agent, targetAgent);
    },
  },
];
