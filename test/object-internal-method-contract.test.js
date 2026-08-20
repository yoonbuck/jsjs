import { assertSame, assertThrows } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { createModuleLoader } from '../src/runtime/module-loader.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import { linkModuleGraph } from '../src/runtime/module-linker.js';
import { evaluateModuleGraph } from '../src/evaluator/modules.js';
import {
  EngineObject,
  currentObjectOperationRealm,
  enterObjectOperationRealm,
  exitObjectOperationRealm,
} from '../src/runtime/object.js';
import { EngineArray } from '../src/runtime/array-object.js';
import * as objectOperations from '../src/runtime/object.js';
import { ThrowSignal, GuestErrorSignal } from '../src/runtime/completion.js';
import {
  Reference,
  UnresolvableReference,
  getValue,
  putValue,
} from '../src/runtime/reference.js';
import { GeneratorObject } from '../src/runtime/generator-object.js';
import { ObjectEnvironmentRecord } from '../src/runtime/environment.js';
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
    name: 'Get passes the original receiver to an inherited accessor',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('receiver', {
        get() {
          return this;
        },
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject(prototype);

      assertSame(prototype.get('receiver', receiver), receiver);
      assertSame(receiver.get('receiver', receiver), receiver);
    },
  },
  {
    name: 'Get and Set preserve an explicit undefined receiver',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('receiver', {
        get() {
          return this;
        },
        enumerable: true,
        configurable: true,
      });
      prototype.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(prototype.get('receiver'), prototype);
      assertSame(prototype.get('receiver', undefined), undefined);
      assertSame(prototype.set('value', 2, undefined), false);
      assertSame(prototype.get('value', prototype), 1);
    },
  },
  {
    name: 'Reference defaults an omitted object receiver without replacing explicit undefined',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('receiver', {
        get() {
          return this;
        },
        enumerable: true,
        configurable: true,
      });
      prototype.defineOwnProperty('inherited', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const object = new EngineObject(prototype);

      assertSame(getValue(new Reference(object, 'receiver')), object);
      assertSame(putValue(new Reference(object, 'inherited'), 2), 2);
      assertSame(object.get('inherited'), 2);

      const explicitUndefined = new EngineObject(prototype);
      assertSame(
        getValue(
          new Reference(explicitUndefined, 'receiver', false, undefined),
        ),
        undefined,
      );
      assertSame(
        putValue(
          new Reference(explicitUndefined, 'inherited', false, undefined),
          3,
        ),
        3,
      );
      assertSame(explicitUndefined.getOwnProperty('inherited'), undefined);
      assertSame(prototype.get('inherited'), 1);
    },
  },
  {
    name: 'an active target Realm outranks an outer object operation Realm',
    run() {
      const operationRealm = createRealm();
      const targetRealm = createRealm();
      const accessorRealm = createRealm();
      const target = new EngineObject(targetRealm.intrinsics.objectPrototype);
      let observedCallerRealm = null;
      const getter = accessorRealm.createNativeFunction({
        name: 'get value',
        length: 0,
        call(_thisValue, _args, _functionObject, callerRealm) {
          observedCallerRealm = callerRealm ?? null;
          return 1;
        },
      });
      target.defineOwnProperty('value', {
        get: getter,
        enumerable: true,
        configurable: true,
      });

      targetRealm.agent.withActiveExecutionRealm(targetRealm, () => {
        enterObjectOperationRealm(operationRealm);

        try {
          target.get('value', target);
        } finally {
          exitObjectOperationRealm(operationRealm);
        }
      });

      assertSame(observedCallerRealm, targetRealm);
    },
  },
  {
    name: 'OrdinaryToPrimitive scopes conversion-method Gets to its caller Realm',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const valueRealm = createRealm({ agent: createAgent() });
      const accessorRealm = createRealm({ agent: createAgent() });
      const value = new EngineObject(valueRealm.intrinsics.objectPrototype);
      /** @type {string[]} */
      const observedNames = [];
      const toString = accessorRealm.createNativeFunction({
        name: 'toString',
        length: 0,
        call() {
          return 'string result';
        },
      });
      const valueOf = accessorRealm.createNativeFunction({
        name: 'valueOf',
        length: 0,
        call() {
          return 7;
        },
      });
      /**
       * @param {string} name
       * @param {unknown} method
       */
      const createGetter = (name, method) =>
        accessorRealm.createNativeFunction({
          name: `get ${name}`,
          length: 0,
          call(_thisValue, _args, _functionObject, caller) {
            observedNames.push(name);
            assertSame(caller, callerRealm);
            assertSame(
              callerRealm.agent.synchronousCallChainRoot(),
              accessorRealm.agent.synchronousCallChainRoot(),
            );
            return method;
          },
        });

      value.defineOwnProperty('toString', {
        get: createGetter('toString', toString),
        enumerable: true,
        configurable: true,
      });
      value.defineOwnProperty('valueOf', {
        get: createGetter('valueOf', valueOf),
        enumerable: true,
        configurable: true,
      });

      assertSame(value.defaultValue('string', callerRealm), 'string result');
      assertSame(value.defaultValue('number', callerRealm), 7);
      assertSame(observedNames.join(','), 'toString,valueOf');

      const abruptValue = new EngineObject(
        valueRealm.intrinsics.objectPrototype,
      );
      /** @type {import('../src/runtime/realm.js').Realm | null} */
      let abruptCaller = null;
      const abruptGetter = accessorRealm.createNativeFunction({
        name: 'get valueOf',
        length: 0,
        call(_thisValue, _args, _functionObject, caller) {
          abruptCaller = caller ?? null;
          assertSame(caller, callerRealm);
          assertSame(
            callerRealm.agent.synchronousCallChainRoot(),
            accessorRealm.agent.synchronousCallChainRoot(),
          );
          throw new GuestErrorSignal('TypeError', 'abrupt conversion getter');
        },
      });
      abruptValue.defineOwnProperty('valueOf', {
        get: abruptGetter,
        enumerable: true,
        configurable: true,
      });

      assertThrows(
        () => abruptValue.defaultValue('number', callerRealm),
        ThrowSignal,
      );
      assertSame(abruptCaller, callerRealm);
      assertSame(currentObjectOperationRealm(), undefined);
      assertSame(callerRealm.agent.activeExecutionRealm, null);
      assertSame(valueRealm.agent.activeExecutionRealm, null);
      assertSame(accessorRealm.agent.activeExecutionRealm, null);
      assertSame(callerRealm.agent.synchronousCallChainRoot(), null);
      assertSame(valueRealm.agent.synchronousCallChainRoot(), null);
      assertSame(accessorRealm.agent.synchronousCallChainRoot(), null);
    },
  },
  {
    name: 'accessors normalize an absent active Realm to undefined',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      const getter = realm.createNativeFunction({
        name: 'get value',
        length: 0,
        call() {
          return 1;
        },
      });
      object.defineOwnProperty('value', {
        get: getter,
        enumerable: true,
        configurable: true,
      });

      realm.agent.withNoActiveExecutionRealm(() => {
        assertSame(object.get('value', object), 1);
      });
    },
  },
  {
    name: 'Set returns false while strict reference wrappers choose the error',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty('locked', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });

      assertSame(object.set('locked', 2, object), false);
      assertThrows(
        () => putValue(new Reference(object, 'locked', true, object), 2),
        GuestErrorSignal,
      );
      assertSame(object.get('locked', object), 1);
    },
  },
  {
    name: 'sloppy global assignment preserves its caller Realm for inherited setters',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const globalRealm = createRealm({ agent: createAgent() });
      const accessorRealm = createRealm({ agent: createAgent() });
      const globalPrototype = new EngineObject(
        globalRealm.intrinsics.objectPrototype,
      );
      const globalObject = new EngineObject(globalPrototype);
      let observedCallerRealm = null;
      const setter = accessorRealm.createNativeFunction({
        name: 'set created',
        length: 1,
        call(_thisValue, _args, _functionObject, caller) {
          observedCallerRealm = caller ?? null;
          return undefined;
        },
      });
      globalPrototype.defineOwnProperty('created', {
        set: setter,
        enumerable: true,
        configurable: true,
      });
      const reference = new UnresolvableReference(
        'created',
        false,
        globalObject,
      );

      assertSame(putValue(reference, 1, callerRealm), 1);
      assertSame(observedCallerRealm, callerRealm);
    },
  },
  {
    name: 'Get HasProperty and Set dispatch through an overridden own-property seam once',
    run() {
      const root = new EngineObject();
      root.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const middle = new EngineObject(root);
      const ordinaryGetOwnProperty = EngineObject.prototype.getOwnProperty;
      let ownPropertyCalls = 0;
      middle.getOwnProperty = function (key) {
        ownPropertyCalls += 1;
        return ordinaryGetOwnProperty.call(this, key);
      };
      const receiver = new EngineObject(middle);

      assertSame(receiver.get('value', receiver), 1);
      assertSame(ownPropertyCalls, 1);

      ownPropertyCalls = 0;
      assertSame(receiver.hasProperty('value'), true);
      assertSame(ownPropertyCalls, 1);

      ownPropertyCalls = 0;
      assertSame(receiver.set('value', 2, receiver), true);
      assertSame(ownPropertyCalls, 1);
      assertSame(receiver.get('value', receiver), 2);
    },
  },
  {
    name: 'object environments preserve their caller Realm for foreign accessors',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const targetRealm = createRealm({ agent: createAgent() });
      const accessorRealm = createRealm({ agent: createAgent() });
      const object = new EngineObject(targetRealm.intrinsics.objectPrototype);
      /** @type {(import('../src/runtime/realm.js').Realm | null)[]} */
      const observedRealms = [];
      const getter = accessorRealm.createNativeFunction({
        name: 'get value',
        length: 0,
        call(_thisValue, _args, _functionObject, caller) {
          observedRealms.push(caller ?? null);
          return 1;
        },
      });
      const setter = accessorRealm.createNativeFunction({
        name: 'set value',
        length: 1,
        call(_thisValue, _args, _functionObject, caller) {
          observedRealms.push(caller ?? null);
          return undefined;
        },
      });
      object.defineOwnProperty('value', {
        get: getter,
        set: setter,
        enumerable: true,
        configurable: true,
      });
      const environment = new ObjectEnvironmentRecord(object);

      assertSame(environment.getBindingValue('value', false, callerRealm), 1);
      environment.setMutableBinding('value', 2, false, callerRealm);
      assertSame(observedRealms.length, 2);
      assertSame(observedRealms[0], callerRealm);
      assertSame(observedRealms[1], callerRealm);
    },
  },
  {
    name: 'OrdinarySetPrototypeOf stops before exotic prototype methods',
    run() {
      const cycleTarget = new EngineObject();
      const ordinaryPrototype = new EngineObject(cycleTarget);

      assertSame(cycleTarget.setPrototypeOf(ordinaryPrototype), false);
      assertSame(cycleTarget.getPrototypeOf(), null);

      const recordingTarget = new EngineObject();
      const recordingPrototype = new EngineObject();
      let recordingCalls = 0;
      recordingPrototype.getPrototypeOf = () => {
        recordingCalls += 1;
        return null;
      };

      assertSame(recordingTarget.setPrototypeOf(recordingPrototype), true);
      assertSame(recordingCalls, 0);

      const throwingTarget = new EngineObject();
      const throwingPrototype = new EngineObject();
      throwingPrototype.getPrototypeOf = () => {
        throw new Error('OrdinarySetPrototypeOf must not call exotic methods');
      };

      assertSame(throwingTarget.setPrototypeOf(throwingPrototype), true);

      const selfReturningTarget = new EngineObject();
      const selfReturningPrototype = new EngineObject();
      let selfReturningCalls = 0;
      selfReturningPrototype.getPrototypeOf = () => {
        selfReturningCalls += 1;
        if (selfReturningCalls > 1) {
          throw new Error(
            'OrdinarySetPrototypeOf followed an exotic self-returning prototype',
          );
        }
        return selfReturningPrototype;
      };

      assertSame(
        selfReturningTarget.setPrototypeOf(selfReturningPrototype),
        true,
      );
      assertSame(selfReturningCalls, 0);
    },
  },
  {
    name: 'ArraySetLength uses its active Realm for same-Agent coercions and abrupts',
    run() {
      const agent = createAgent();
      const callerRealm = createRealm({ agent });
      const operationRealm = createRealm({ agent });
      const valueRealm = createRealm({ agent });
      const array = new EngineArray(operationRealm.intrinsics.arrayPrototype);
      const value = new EngineObject(valueRealm.intrinsics.objectPrototype);
      const valueOf = valueRealm.createNativeFunction({
        name: 'valueOf',
        length: 0,
        call(_thisValue, _args, _functionObject, coercionCallerRealm) {
          assertSame(coercionCallerRealm, operationRealm);
          return 1.5;
        },
      });
      const descriptor = new EngineObject(
        operationRealm.intrinsics.objectPrototype,
      );
      descriptor.defineOwnProperty('value', {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      value.defineOwnProperty('valueOf', {
        value: valueOf,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const defineProperty =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            operationRealm.globalObject.get('Object')
          ).get('defineProperty')
        );

      callerRealm.agent.withActiveExecutionRealm(callerRealm, () => {
        const error = assertThrows(
          () =>
            callCallable(
              defineProperty,
              undefined,
              [array, 'length', descriptor],
              callerRealm,
            ),
          ThrowSignal,
        );

        assertSame(
          /** @type {EngineObject} */ (
            /** @type {ThrowSignal} */ (error).value
          ).getPrototypeOf(),
          operationRealm.intrinsics.rangeErrorPrototype,
        );
        assertSame(callerRealm.agent.activeExecutionRealm, callerRealm);
      });
      assertSame(callerRealm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'ArraySetLength links cross-Agent coercion callers',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const operationRealm = createRealm({ agent: createAgent() });
      const valueRealm = createRealm({ agent: createAgent() });
      const array = new EngineArray(operationRealm.intrinsics.arrayPrototype);
      const value = new EngineObject(valueRealm.intrinsics.objectPrototype);
      const valueOf = valueRealm.createNativeFunction({
        name: 'valueOf',
        length: 0,
        call(_thisValue, _args, _functionObject, coercionCallerRealm) {
          assertSame(coercionCallerRealm, operationRealm);
          assertSame(
            valueRealm.agent.synchronousCallChainRoot(),
            operationRealm.agent.synchronousCallChainRoot(),
          );
          return 1;
        },
      });
      const descriptor = new EngineObject(
        operationRealm.intrinsics.objectPrototype,
      );
      descriptor.defineOwnProperty('value', {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      value.defineOwnProperty('valueOf', {
        value: valueOf,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const defineProperty =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          /** @type {EngineObject} */ (
            operationRealm.globalObject.get('Object')
          ).get('defineProperty')
        );

      callerRealm.agent.withActiveExecutionRealm(callerRealm, () => {
        assertSame(
          callCallable(
            defineProperty,
            undefined,
            [array, 'length', descriptor],
            callerRealm,
          ),
          array,
        );
        assertSame(callerRealm.agent.activeExecutionRealm, callerRealm);
      });
      assertSame(callerRealm.agent.activeExecutionRealm, null);
      assertSame(operationRealm.agent.activeExecutionRealm, null);
      assertSame(valueRealm.agent.activeExecutionRealm, null);
      assertSame(array.get('length'), 1);
    },
  },
  {
    name: 'ArraySetLength uses the active object operation Realm for coercion',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const arrayRealm = createRealm({ agent: createAgent() });
      const valueRealm = createRealm({ agent: createAgent() });
      const array = new EngineArray(arrayRealm.intrinsics.arrayPrototype);
      const value = new EngineObject(valueRealm.intrinsics.objectPrototype);
      /** @type {(import('../src/runtime/realm.js').Realm | null)[]} */
      const observedRealms = [];
      const valueOf = valueRealm.createNativeFunction({
        name: 'valueOf',
        length: 0,
        call(_thisValue, _args, _functionObject, caller) {
          observedRealms.push(caller ?? null);
          return 1;
        },
      });
      value.defineOwnProperty('valueOf', {
        value: valueOf,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      enterObjectOperationRealm(callerRealm);

      try {
        assertSame(array.set('length', value, array), true);
      } finally {
        exitObjectOperationRealm(callerRealm);
      }
      assertSame(observedRealms.length, 2);
      assertSame(observedRealms[0], callerRealm);
      assertSame(observedRealms[1], callerRealm);
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
        ).getPrototypeOf(),
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
