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
import { EngineArray, isArrayObject } from '../src/runtime/array-object.js';
import { createPrimitiveWrapper } from '../src/runtime/primitive-object.js';
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
import { SuperReferenceBase } from '../src/runtime/super-reference.js';
import {
  callCallable,
  constructCallable,
  isCallable,
  isConstructor,
} from '../src/runtime/capabilities.js';
import { createAbruptRealmCallable } from '../src/runtime/function-realm.js';
import { createIterResultObject } from '../src/runtime/iterator.js';
import {
  HostileExotic,
  createEnumerationIterator,
} from './harness/hostile-exotic.js';

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

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineGlobal(realm, name, value) {
  realm.globalObject.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {readonly unknown[][]} actual
 * @param {readonly unknown[][]} expected
 * @returns {void}
 */
function assertCallRecords(actual, expected) {
  assertSame(actual.length, expected.length);

  for (let index = 0; index < expected.length; index += 1) {
    const received = actual[index];
    const wanted = expected[index];
    assertSame(received.length, wanted.length);

    for (let entry = 0; entry < wanted.length; entry += 1) {
      assertSame(received[entry], wanted[entry]);
    }
  }
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
  {
    name: 'ordinary Enumerate returns a public Realm-owned iterator protocol object',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      object.defineOwnProperty('first', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const iterator = realm.agent.withActiveExecutionRealm(realm, () =>
        object.enumerate(),
      );
      const next = iterator.get('next', iterator);
      const iteratorMethod = iterator.get(
        realm.agent.wellKnownSymbols.iterator,
        iterator,
      );
      assertSame(isCallable(next), true);
      assertSame(iterator.getPrototypeOf(), realm.intrinsics.iteratorPrototype);
      assertSame(
        iterator.getOwnProperty(realm.agent.wellKnownSymbols.iterator),
        undefined,
      );
      assertSame(isCallable(iteratorMethod), true);
      assertSame(/** @type {any} */ (iteratorMethod).realm, realm);
      assertSame(
        callCallable(
          /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            iteratorMethod
          ),
          iterator,
          [],
          realm,
        ),
        iterator,
      );

      const first = /** @type {EngineObject} */ (
        callCallable(next, iterator, [])
      );
      assertSame(first.get('value', first), 'first');
      assertSame(first.get('done', first), false);
      assertSame(first.getPrototypeOf(), realm.intrinsics.objectPrototype);

      const done = /** @type {EngineObject} */ (
        callCallable(next, iterator, [])
      );
      assertSame(done.get('done', done), true);
      assertSame(done.getPrototypeOf(), realm.intrinsics.objectPrototype);

      assertThrows(() => object.enumerate(), TypeError);
    },
  },
  {
    name: 'ordinary Enumerate next rejects a foreign receiver',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      object.defineOwnProperty('key', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const iterator = realm.agent.withActiveExecutionRealm(realm, () =>
        object.enumerate(),
      );
      const next = iterator.get('next', iterator);
      assertThrows(
        () =>
          callCallable(
            /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
              next
            ),
            new EngineObject(realm.intrinsics.objectPrototype),
            [],
          ),
        ThrowSignal,
      );
    },
  },
  {
    name: 'ordinary Enumerate return closes an unfinished delegated iterator once',
    run() {
      const evaluatingRealm = createRealm({ agent: createAgent() });
      const boundaryRealm = createRealm({ agent: createAgent() });
      let nextCalls = 0;
      let returnCalls = 0;
      /** @type {(import('../src/runtime/realm.js').Realm | null)[]} */
      const returnRealms = [];
      const remainder = new EngineObject(
        /** @type {EngineObject} */ (
          boundaryRealm.intrinsics.iteratorPrototype
        ),
      );
      remainder.defineOwnProperty('next', {
        value: boundaryRealm.createNativeFunction({
          name: 'next',
          length: 0,
          call() {
            nextCalls += 1;
            return createIterResultObject(boundaryRealm, 'tail', false);
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      remainder.defineOwnProperty('return', {
        value: boundaryRealm.createNativeFunction({
          name: 'return',
          length: 0,
          call(thisValue) {
            assertSame(thisValue, remainder);
            returnCalls += 1;
            returnRealms.push(boundaryRealm.agent.activeExecutionRealm);
            return createIterResultObject(boundaryRealm, undefined, true);
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      const boundary = new HostileExotic(
        boundaryRealm.intrinsics.objectPrototype,
        remainder,
      );
      const source = new EngineObject(
        evaluatingRealm.intrinsics.objectPrototype,
      );
      source.defineOwnProperty('own', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(source.setPrototypeOf(boundary), true);

      const iterator = evaluatingRealm.agent.withActiveExecutionRealm(
        evaluatingRealm,
        () => source.enumerate(),
      );
      const next = /** @type {any} */ (iterator.get('next', iterator));
      const returnMethod = iterator.get('return', iterator);
      assertSame(isCallable(returnMethod), true);
      assertSame(iterator.getOwnProperty('return')?.value, returnMethod);

      const first = /** @type {EngineObject} */ (
        callCallable(next, iterator, [], evaluatingRealm)
      );
      assertSame(first.get('value', first), 'own');
      assertSame(first.get('done', first), false);

      const closed = /** @type {EngineObject} */ (
        callCallable(
          /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            returnMethod
          ),
          iterator,
          [],
          evaluatingRealm,
        )
      );
      assertSame(closed.get('value', closed), undefined);
      assertSame(closed.get('done', closed), true);
      assertSame(
        closed.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );
      assertSame(returnCalls, 1);
      assertSame(nextCalls, 0);
      assertSame(returnRealms.length, 1);
      assertSame(returnRealms[0], boundaryRealm);

      const repeated = /** @type {EngineObject} */ (
        callCallable(
          /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
            returnMethod
          ),
          iterator,
          [],
          evaluatingRealm,
        )
      );
      const afterClose = /** @type {EngineObject} */ (
        callCallable(next, iterator, [], evaluatingRealm)
      );
      assertSame(repeated.get('done', repeated), true);
      assertSame(afterClose.get('done', afterClose), true);
      assertSame(returnCalls, 1);
      assertSame(nextCalls, 0);
      assertSame(/** @type {any} */ (iterator).target, null);
      assertSame(/** @type {any} */ (iterator).remainder, null);
      assertSame(/** @type {any} */ (iterator).remainderBoundary, null);
      assertSame(evaluatingRealm.agent.activeExecutionRealm, null);
      assertSame(boundaryRealm.agent.activeExecutionRealm, null);
      assertSame(evaluatingRealm.agent._synchronousCallChain, null);
      assertSame(boundaryRealm.agent._synchronousCallChain, null);
      assertSame(evaluatingRealm.agent._generatorHostChain, null);
      assertSame(boundaryRealm.agent._generatorHostChain, null);
    },
  },
  {
    name: 'ordinary Enumerate return clears delegated state after abrupt cleanup',
    run() {
      const evaluatingRealm = createRealm({ agent: createAgent() });
      const boundaryRealm = createRealm({ agent: createAgent() });
      let returnCalls = 0;
      const remainder = new EngineObject(
        /** @type {EngineObject} */ (
          boundaryRealm.intrinsics.iteratorPrototype
        ),
      );
      remainder.defineOwnProperty('next', {
        value: boundaryRealm.createNativeFunction({
          name: 'next',
          length: 0,
          call() {
            return createIterResultObject(boundaryRealm, 'tail', false);
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      remainder.defineOwnProperty('return', {
        value: boundaryRealm.createNativeFunction({
          name: 'return',
          length: 0,
          call() {
            returnCalls += 1;
            throw new GuestErrorSignal('TypeError', 'delegated close');
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      const boundary = new HostileExotic(
        boundaryRealm.intrinsics.objectPrototype,
        remainder,
      );
      const source = new EngineObject(
        evaluatingRealm.intrinsics.objectPrototype,
      );
      source.defineOwnProperty('own', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(source.setPrototypeOf(boundary), true);

      const iterator = evaluatingRealm.agent.withActiveExecutionRealm(
        evaluatingRealm,
        () => source.enumerate(),
      );
      const next = /** @type {any} */ (iterator.get('next', iterator));
      const returnMethod =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          iterator.get('return', iterator)
        );
      const first = /** @type {EngineObject} */ (
        callCallable(next, iterator, [], evaluatingRealm)
      );
      assertSame(first.get('value', first), 'own');

      const abrupt = /** @type {ThrowSignal} */ (
        assertThrows(
          () => callCallable(returnMethod, iterator, [], evaluatingRealm),
          ThrowSignal,
        )
      );
      assertSame(
        /** @type {EngineObject} */ (abrupt.value).get('message'),
        'delegated close',
      );
      const repeated = /** @type {EngineObject} */ (
        callCallable(returnMethod, iterator, [], evaluatingRealm)
      );
      const afterClose = /** @type {EngineObject} */ (
        callCallable(next, iterator, [], evaluatingRealm)
      );
      assertSame(repeated.get('done', repeated), true);
      assertSame(afterClose.get('done', afterClose), true);
      assertSame(returnCalls, 1);
      assertSame(/** @type {any} */ (iterator).target, null);
      assertSame(/** @type {any} */ (iterator).remainder, null);
      assertSame(/** @type {any} */ (iterator).remainderBoundary, null);
      assertSame(evaluatingRealm.agent.activeExecutionRealm, null);
      assertSame(boundaryRealm.agent.activeExecutionRealm, null);
      assertSame(evaluatingRealm.agent._synchronousCallChain, null);
      assertSame(boundaryRealm.agent._synchronousCallChain, null);
      assertSame(evaluatingRealm.agent._generatorHostChain, null);
      assertSame(boundaryRealm.agent._generatorHostChain, null);
    },
  },
  {
    name: 'ordinary Enumerate return is inert during delegated cleanup reentrancy',
    run() {
      const evaluatingRealm = createRealm({ agent: createAgent() });
      const boundaryRealm = createRealm({ agent: createAgent() });
      let nextCalls = 0;
      let returnCalls = 0;
      /** @type {EngineObject | null} */
      let outerIterator = null;
      /** @type {import('../src/runtime/descriptors.js').CallableLike | null} */
      let outerNext = null;
      /** @type {import('../src/runtime/descriptors.js').CallableLike | null} */
      let outerReturn = null;
      /** @type {{ next: EngineObject | null, return: EngineObject | null }} */
      const nestedResults = { next: null, return: null };
      const remainder = new EngineObject(
        /** @type {EngineObject} */ (
          boundaryRealm.intrinsics.iteratorPrototype
        ),
      );
      remainder.defineOwnProperty('next', {
        value: boundaryRealm.createNativeFunction({
          name: 'next',
          length: 0,
          call() {
            nextCalls += 1;
            return createIterResultObject(boundaryRealm, 'tail', false);
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      remainder.defineOwnProperty('return', {
        value: boundaryRealm.createNativeFunction({
          name: 'return',
          length: 0,
          call() {
            returnCalls += 1;
            if (
              returnCalls === 1 &&
              outerIterator !== null &&
              outerNext !== null &&
              outerReturn !== null
            ) {
              nestedResults.next = /** @type {EngineObject} */ (
                callCallable(outerNext, outerIterator, [], evaluatingRealm)
              );
              nestedResults.return = /** @type {EngineObject} */ (
                callCallable(outerReturn, outerIterator, [], evaluatingRealm)
              );
            }
            return createIterResultObject(boundaryRealm, undefined, true);
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      const boundary = new HostileExotic(
        boundaryRealm.intrinsics.objectPrototype,
        remainder,
      );
      const source = new EngineObject(
        evaluatingRealm.intrinsics.objectPrototype,
      );
      source.defineOwnProperty('own', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(source.setPrototypeOf(boundary), true);
      outerIterator = evaluatingRealm.agent.withActiveExecutionRealm(
        evaluatingRealm,
        () => source.enumerate(),
      );
      outerNext =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          outerIterator.get('next', outerIterator)
        );
      outerReturn =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          outerIterator.get('return', outerIterator)
        );
      const first = /** @type {EngineObject} */ (
        callCallable(outerNext, outerIterator, [], evaluatingRealm)
      );
      assertSame(first.get('value', first), 'own');

      const closed = /** @type {EngineObject} */ (
        callCallable(outerReturn, outerIterator, [], evaluatingRealm)
      );
      assertSame(closed.get('done', closed), true);
      assertSame(nestedResults.next?.get('done', nestedResults.next), true);
      assertSame(nestedResults.return?.get('done', nestedResults.return), true);
      assertSame(nextCalls, 0);
      assertSame(returnCalls, 1);
    },
  },
  {
    name: 'ordinary Enumerate snapshots candidates while live lookup honors deletion, shadowing, and replacement',
    run() {
      const realm = createRealm();
      const initialPrototype = new EngineObject(
        realm.intrinsics.objectPrototype,
      );
      const object = new EngineObject(initialPrototype);
      const replacementPrototype = new EngineObject(
        realm.intrinsics.objectPrototype,
      );

      for (const key of ['2', '1', 'text', 'removed']) {
        object.defineOwnProperty(key, {
          value: key,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      object.defineOwnProperty('shadow', {
        value: 'own',
        writable: true,
        enumerable: false,
        configurable: true,
      });
      initialPrototype.defineOwnProperty('removed', {
        value: 'initial',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      initialPrototype.defineOwnProperty('shadow', {
        value: 'initial',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      replacementPrototype.defineOwnProperty('removed', {
        value: 'replacement',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      replacementPrototype.defineOwnProperty('shadow', {
        value: 'replacement',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      replacementPrototype.defineOwnProperty('late', {
        value: 'late',
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const iterator = realm.agent.withActiveExecutionRealm(realm, () =>
        object.enumerate(),
      );
      object.delete('removed');
      assertSame(object.setPrototypeOf(replacementPrototype), true);

      const next = iterator.get('next', iterator);
      /** @type {string[]} */
      const names = [];
      for (;;) {
        const step = /** @type {EngineObject} */ (
          callCallable(next, iterator, [])
        );
        if (step.get('done', step) === true) {
          break;
        }
        names.push(/** @type {string} */ (step.get('value', step)));
      }

      assertSame(names.join(','), '1,2,text,removed');
    },
  },
  {
    name: 'ordinary Enumerate consumes an overridden prototype Enumerate remainder through its public protocol',
    run() {
      const realm = createRealm();
      let enumerateCalls = 0;
      let nextGets = 0;
      let index = 0;
      const remainder = new EngineObject(realm.intrinsics.objectPrototype);
      const values = ['own', 'tail', 'tail'];
      const next = realm.createNativeFunction({
        name: 'next',
        length: 0,
        call() {
          const value = values[index];
          index += 1;
          return createIterResultObject(realm, value, index > values.length);
        },
      });
      remainder.defineOwnProperty('next', {
        get: realm.createNativeFunction({
          name: 'get next',
          length: 0,
          call(thisValue) {
            assertSame(thisValue, remainder);
            nextGets += 1;
            return next;
          },
        }),
        enumerable: false,
        configurable: true,
      });

      class EnumerateBoundary extends EngineObject {
        enumerate() {
          enumerateCalls += 1;
          return remainder;
        }
      }

      const boundary = new EnumerateBoundary(realm.intrinsics.objectPrototype);
      const object = new EngineObject(boundary);
      object.defineOwnProperty('own', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const iterator = realm.agent.withActiveExecutionRealm(realm, () =>
        object.enumerate(),
      );
      const iteratorNext = iterator.get('next', iterator);
      /** @type {string[]} */
      const names = [];
      for (;;) {
        const result = /** @type {EngineObject} */ (
          callCallable(iteratorNext, iterator, [])
        );
        if (result.get('done', result) === true) {
          break;
        }
        names.push(/** @type {string} */ (result.get('value', result)));
      }

      assertSame(names.join(','), 'own,tail');
      assertSame(enumerateCalls, 1);
      assertSame(nextGets, 1);
    },
  },
  {
    name: 'hostile exotic exposes all twelve Table 5 seams and propagates abrupt completions',
    run() {
      const prototype = new EngineObject();
      const iterator = new EngineObject();
      const exotic = new HostileExotic(prototype, iterator);
      const nextPrototype = new EngineObject();
      const receiver = new EngineObject();
      const descriptor = {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      };
      const symbol = Symbol('hostile');
      exotic.virtual.set('own', descriptor);
      exotic.virtual.set(symbol, descriptor);

      assertSame(exotic.getPrototypeOf(), prototype);
      assertSame(exotic.setPrototypeOf(nextPrototype), false);
      assertSame(exotic.isExtensible(), true);
      assertSame(exotic.preventExtensions(), false);
      assertSame(exotic.getOwnProperty('own'), descriptor);
      assertSame(exotic.hasProperty('own'), true);
      assertSame(exotic.get('read', receiver), 'get:read');
      assertSame(exotic.set('write', 2, receiver), false);
      assertSame(exotic.delete('own'), false);
      assertSame(exotic.defineOwnProperty('defined', descriptor), false);
      assertSame(exotic.enumerate(), iterator);
      const keys = exotic.ownPropertyKeys();
      assertSame(keys.length, 2);
      assertSame(keys[0], 'own');
      assertSame(keys[1], symbol);
      assertCallRecords(exotic.calls, [
        ['getPrototypeOf'],
        ['setPrototypeOf', nextPrototype],
        ['isExtensible'],
        ['preventExtensions'],
        ['getOwnProperty', 'own'],
        ['hasProperty', 'own'],
        ['get', 'read', receiver],
        ['set', 'write', 2, receiver],
        ['delete', 'own'],
        ['defineOwnProperty', 'defined', descriptor],
        ['enumerate'],
        ['ownPropertyKeys'],
      ]);

      exotic.calls.length = 0;
      const abrupt = new RangeError('hostile abrupt');
      /** @type {[string, () => unknown][]} */
      const operations = [
        ['getPrototypeOf', () => exotic.getPrototypeOf()],
        ['setPrototypeOf', () => exotic.setPrototypeOf(nextPrototype)],
        ['isExtensible', () => exotic.isExtensible()],
        ['preventExtensions', () => exotic.preventExtensions()],
        ['getOwnProperty', () => exotic.getOwnProperty('own')],
        ['hasProperty', () => exotic.hasProperty('own')],
        ['get', () => exotic.get('read', receiver)],
        ['set', () => exotic.set('write', 2, receiver)],
        ['delete', () => exotic.delete('own')],
        [
          'defineOwnProperty',
          () => exotic.defineOwnProperty('defined', descriptor),
        ],
        ['enumerate', () => exotic.enumerate()],
        ['ownPropertyKeys', () => exotic.ownPropertyKeys()],
      ];

      for (const [name, operation] of operations) {
        exotic.abrupt.set(name, abrupt);
        assertSame(assertThrows(operation, RangeError), abrupt);
        exotic.abrupt.delete(name);
      }

      assertCallRecords(exotic.calls, [
        ['getPrototypeOf'],
        ['setPrototypeOf', nextPrototype],
        ['isExtensible'],
        ['preventExtensions'],
        ['getOwnProperty', 'own'],
        ['hasProperty', 'own'],
        ['get', 'read', receiver],
        ['set', 'write', 2, receiver],
        ['delete', 'own'],
        ['defineOwnProperty', 'defined', descriptor],
        ['enumerate'],
        ['ownPropertyKeys'],
      ]);
    },
  },
  {
    name: 'hostile exotic preserves direct inherited primitive and super receivers',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        createEnumerationIterator(realm, []),
      );
      const directReceiver = new EngineObject(realm.intrinsics.objectPrototype);
      const child = new EngineObject(exotic);
      const primitiveWrapper = createPrimitiveWrapper(realm, 'primitive');
      const superReceiver = new EngineObject(realm.intrinsics.objectPrototype);
      const descriptor = {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      };
      exotic.virtual.set('inherited', descriptor);
      assertSame(primitiveWrapper.setPrototypeOf(exotic), true);
      exotic.calls.length = 0;

      assertSame(exotic.get('direct', directReceiver), 'get:direct');
      assertSame(exotic.set('direct', 1, directReceiver), false);
      assertSame(child.get('inherited', child), 'get:inherited');
      assertSame(child.set('inherited', 2, child), false);
      assertSame(child.hasProperty('inherited'), true);

      assertSame(
        getValue(
          new Reference(primitiveWrapper, 'primitiveGet', false, 'primitive'),
        ),
        'get:primitiveGet',
      );
      assertSame(
        putValue(
          new Reference(primitiveWrapper, 'primitiveSet', false, 'primitive'),
          3,
        ),
        3,
      );

      const superReference = new SuperReferenceBase(exotic, superReceiver);
      assertSame(superReference.get('superGet'), 'get:superGet');
      assertSame(superReference.set('superSet', 4), false);
      assertCallRecords(exotic.calls, [
        ['get', 'direct', directReceiver],
        ['set', 'direct', 1, directReceiver],
        ['get', 'inherited', child],
        ['set', 'inherited', 2, child],
        ['hasProperty', 'inherited'],
        ['get', 'primitiveGet', 'primitive'],
        ['set', 'primitiveSet', 3, 'primitive'],
        ['get', 'superGet', superReceiver],
        ['set', 'superSet', 4, superReceiver],
      ]);
    },
  },
  {
    name: 'hostile exotic records object metadata reflection JSON in and with dispatch',
    run() {
      const realm = createRealm();
      const prototype = new EngineObject(realm.intrinsics.objectPrototype);
      const nextPrototype = new EngineObject(realm.intrinsics.objectPrototype);
      const exotic = new HostileExotic(
        prototype,
        createEnumerationIterator(realm, []),
      );
      const symbol = Symbol('hostile');
      exotic.virtual.set('visible', {
        value: 11,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      exotic.virtual.set('hidden', {
        value: 12,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      exotic.virtual.set(symbol, {
        value: 13,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(realm, 'hostile', exotic);
      defineGlobal(realm, 'expectedPrototype', prototype);
      defineGlobal(realm, 'nextPrototype', nextPrototype);

      const reset = () => {
        exotic.calls.length = 0;
      };

      assertSame(
        evaluateScript(
          realm,
          'Object.getPrototypeOf(hostile) === expectedPrototype;',
        ).value,
        true,
      );
      assertCallRecords(exotic.calls, [['getPrototypeOf']]);

      reset();
      assertSame(
        evaluateScript(
          realm,
          'var name; try { Object.setPrototypeOf(hostile, nextPrototype); } catch (error) { name = error.name; } name;',
        ).value,
        'TypeError',
      );
      assertCallRecords(exotic.calls, [['setPrototypeOf', nextPrototype]]);

      reset();
      assertSame(
        evaluateScript(realm, 'Object.isExtensible(hostile);').value,
        true,
      );
      assertCallRecords(exotic.calls, [['isExtensible']]);

      reset();
      assertSame(
        evaluateScript(
          realm,
          'var name; try { Object.preventExtensions(hostile); } catch (error) { name = error.name; } name;',
        ).value,
        'TypeError',
      );
      assertCallRecords(exotic.calls, [['preventExtensions']]);

      reset();
      assertSame(
        evaluateScript(
          realm,
          'Object.getOwnPropertyDescriptor(hostile, "visible").value;',
        ).value,
        11,
      );
      assertCallRecords(exotic.calls, [['getOwnProperty', 'visible']]);

      reset();
      assertSame(
        evaluateScript(
          realm,
          'var name; try { Object.defineProperty(hostile, "defined", { value: 3, writable: false, enumerable: true, configurable: false }); } catch (error) { name = error.name; } name;',
        ).value,
        'TypeError',
      );
      assertSame(exotic.calls.length, 1);
      assertSame(exotic.calls[0][0], 'defineOwnProperty');
      assertSame(exotic.calls[0][1], 'defined');
      const definedDescriptor = /** @type {any} */ (exotic.calls[0][2]);
      assertSame(definedDescriptor.value, 3);
      assertSame(definedDescriptor.writable, false);
      assertSame(definedDescriptor.enumerable, true);
      assertSame(definedDescriptor.configurable, false);

      reset();
      assertSame(evaluateScript(realm, 'delete hostile.visible;').value, false);
      assertCallRecords(exotic.calls, [['delete', 'visible']]);

      reset();
      assertSame(evaluateScript(realm, '"visible" in hostile;').value, true);
      assertCallRecords(exotic.calls, [['hasProperty', 'visible']]);

      reset();
      evaluateScript(realm, 'with (hostile) { visible; }');
      assertCallRecords(exotic.calls, [
        ['hasProperty', 'visible'],
        ['hasProperty', 'visible'],
        ['get', 'visible', exotic],
      ]);

      reset();
      assertSame(
        evaluateScript(realm, 'Object.keys(hostile).join(",");').value,
        'visible',
      );
      assertCallRecords(exotic.calls, [
        ['ownPropertyKeys'],
        ['getOwnProperty', 'visible'],
        ['getOwnProperty', 'hidden'],
      ]);

      reset();
      assertSame(
        evaluateScript(realm, 'Object.getOwnPropertyNames(hostile).join(",");')
          .value,
        'visible,hidden',
      );
      assertCallRecords(exotic.calls, [['ownPropertyKeys']]);

      reset();
      assertSame(
        evaluateScript(realm, 'Object.getOwnPropertySymbols(hostile).length;')
          .value,
        1,
      );
      assertCallRecords(exotic.calls, [['ownPropertyKeys']]);

      reset();
      assertSame(
        evaluateScript(realm, 'Reflect.ownKeys(hostile).length;').value,
        3,
      );
      assertCallRecords(exotic.calls, [['ownPropertyKeys']]);

      reset();
      assertSame(
        evaluateScript(realm, 'JSON.stringify(hostile);').value,
        '{"visible":"get:visible"}',
      );
      assertCallRecords(exotic.calls, [
        ['get', 'toJSON', exotic],
        ['ownPropertyKeys'],
        ['getOwnProperty', 'visible'],
        ['getOwnProperty', 'hidden'],
        ['get', 'visible', exotic],
      ]);
    },
  },
  {
    name: 'hostile exotic propagates every Table 5 abrupt completion through public consumers',
    run() {
      const realm = createRealm();
      const nextPrototype = new EngineObject(realm.intrinsics.objectPrototype);
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        createEnumerationIterator(realm, []),
      );
      defineGlobal(realm, 'hostile', exotic);
      defineGlobal(realm, 'nextPrototype', nextPrototype);

      /**
       * @param {string} method
       * @param {string} source
       * @param {readonly unknown[]} expected
       * @param {number} [expectedLength]
       * @returns {unknown[]}
       */
      const assertPublicAbrupt = (
        method,
        source,
        expected,
        expectedLength = expected.length,
      ) => {
        exotic.calls.length = 0;
        const abrupt = new GuestErrorSignal('TypeError', `${method} abrupt`);
        exotic.abrupt.set(method, abrupt);
        const completion = evaluateScript(
          realm,
          `var message; try { ${source} message = "normal"; } catch (error) { message = error.message; } message;`,
        );
        exotic.abrupt.delete(method);
        assertSame(completion.type, 'normal');
        assertSame(completion.value, `${method} abrupt`);
        assertSame(exotic.calls.length, 1);
        const record = exotic.calls[0];
        assertSame(record.length, expectedLength);
        for (let index = 0; index < expected.length; index += 1) {
          assertSame(record[index], expected[index]);
        }
        return record;
      };

      assertPublicAbrupt('getPrototypeOf', 'Object.getPrototypeOf(hostile);', [
        'getPrototypeOf',
      ]);
      assertPublicAbrupt(
        'setPrototypeOf',
        'Object.setPrototypeOf(hostile, nextPrototype);',
        ['setPrototypeOf', nextPrototype],
      );
      assertPublicAbrupt('isExtensible', 'Object.isExtensible(hostile);', [
        'isExtensible',
      ]);
      assertPublicAbrupt(
        'preventExtensions',
        'Object.preventExtensions(hostile);',
        ['preventExtensions'],
      );
      assertPublicAbrupt(
        'getOwnProperty',
        'Object.getOwnPropertyDescriptor(hostile, "visible");',
        ['getOwnProperty', 'visible'],
      );
      assertPublicAbrupt('hasProperty', '"visible" in hostile;', [
        'hasProperty',
        'visible',
      ]);
      assertPublicAbrupt('get', 'hostile.visible;', ['get', 'visible', exotic]);
      assertPublicAbrupt('set', 'hostile.visible = 1;', [
        'set',
        'visible',
        1,
        exotic,
      ]);
      assertPublicAbrupt('delete', 'delete hostile.visible;', [
        'delete',
        'visible',
      ]);
      const defineRecord = assertPublicAbrupt(
        'defineOwnProperty',
        'Object.defineProperty(hostile, "defined", { value: 3, writable: false, enumerable: true, configurable: false });',
        ['defineOwnProperty', 'defined'],
        3,
      );
      const descriptor = /** @type {any} */ (defineRecord[2]);
      assertSame(descriptor.value, 3);
      assertSame(descriptor.writable, false);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, false);
      assertPublicAbrupt('enumerate', 'for (var key in hostile) {}', [
        'enumerate',
      ]);
      assertPublicAbrupt('ownPropertyKeys', 'Object.keys(hostile);', [
        'ownPropertyKeys',
      ]);
    },
  },
  {
    name: 'hostile exotic Enumerate uses public iterator paths across Realms and Agents',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        createEnumerationIterator(realm, ['sync']),
      );
      defineGlobal(realm, 'hostile', exotic);
      const reset = () => {
        exotic.calls.length = 0;
        exotic.activeRealms.length = 0;
      };
      const captureSyncError = () =>
        evaluateScript(
          realm,
          'var message; try { for (var key in hostile) { } message = "normal"; } catch (error) { message = error.message; } message;',
        ).value;
      /**
       * @param {() => unknown} next
       * @returns {EngineObject}
       */
      const createIteratorWithNext = (next) => {
        const iterator = new EngineObject(realm.intrinsics.objectPrototype);
        iterator.defineOwnProperty('next', {
          value: realm.createNativeFunction({
            name: 'next',
            length: 0,
            call() {
              return next();
            },
          }),
          writable: true,
          enumerable: false,
          configurable: true,
        });
        return iterator;
      };

      assertSame(
        evaluateScript(
          realm,
          'var names = ""; for (var key in hostile) { names += key; } names;',
        ).value,
        'sync',
      );
      assertCallRecords(exotic.calls, [['enumerate']]);

      reset();
      exotic.iterator = createEnumerationIterator(realm, ['generator']);
      assertSame(
        evaluateScript(
          realm,
          'function* values() { for (var key in hostile) { yield key; } } var iterator = values(); var first = iterator.next(); var done = iterator.next(); [first.value, first.done, done.done].join("|");',
        ).value,
        'generator|false|true',
      );
      assertCallRecords(exotic.calls, [['enumerate']]);

      const sharedAgent = createAgent();
      const sameAgentRealm = createRealm({ agent: sharedAgent });
      const sameAgentTargetRealm = createRealm({ agent: sharedAgent });
      const sameAgentExotic = new HostileExotic(
        sameAgentTargetRealm.intrinsics.objectPrototype,
        createEnumerationIterator(sameAgentRealm, ['same-agent']),
      );
      defineGlobal(sameAgentRealm, 'foreignHostile', sameAgentExotic);
      assertSame(
        evaluateScript(
          sameAgentRealm,
          'var key; for (key in foreignHostile) { break; } key;',
        ).value,
        'same-agent',
      );
      assertCallRecords(sameAgentExotic.calls, [['enumerate']]);
      assertSame(sameAgentExotic.activeRealms[0], sameAgentRealm);
      assertSame(sharedAgent.activeExecutionRealm, null);

      const evaluatingRealm = createRealm({ agent: createAgent() });
      const targetRealm = createRealm({ agent: createAgent() });
      const crossAgentExotic = new HostileExotic(
        targetRealm.intrinsics.objectPrototype,
        createEnumerationIterator(evaluatingRealm, ['cross-agent']),
      );
      defineGlobal(evaluatingRealm, 'foreignHostile', crossAgentExotic);
      assertSame(
        evaluateScript(
          evaluatingRealm,
          'var key; for (key in foreignHostile) { break; } key;',
        ).value,
        'cross-agent',
      );
      assertCallRecords(crossAgentExotic.calls, [['enumerate']]);
      assertSame(crossAgentExotic.activeRealms[0], evaluatingRealm);
      assertSame(evaluatingRealm.agent.activeExecutionRealm, null);
      assertSame(targetRealm.agent.activeExecutionRealm, null);

      reset();
      exotic.abrupt.set(
        'enumerate',
        new GuestErrorSignal('TypeError', 'enumerate abrupt'),
      );
      assertSame(captureSyncError(), 'enumerate abrupt');
      assertCallRecords(exotic.calls, [['enumerate']]);
      exotic.abrupt.delete('enumerate');

      reset();
      exotic.iterator = new EngineObject(realm.intrinsics.objectPrototype);
      assertSame(captureSyncError(), 'Enumerate iterator next is not callable');
      assertCallRecords(exotic.calls, [['enumerate']]);

      reset();
      const getterAbruptIterator = new EngineObject(
        realm.intrinsics.objectPrototype,
      );
      getterAbruptIterator.defineOwnProperty('next', {
        get: realm.createNativeFunction({
          name: 'get next',
          length: 0,
          call() {
            throw new GuestErrorSignal('TypeError', 'next getter abrupt');
          },
        }),
        enumerable: false,
        configurable: true,
      });
      exotic.iterator = getterAbruptIterator;
      assertSame(captureSyncError(), 'next getter abrupt');
      assertCallRecords(exotic.calls, [['enumerate']]);

      reset();
      exotic.iterator = createIteratorWithNext(() => {
        throw new GuestErrorSignal('TypeError', 'next call abrupt');
      });
      assertSame(captureSyncError(), 'next call abrupt');
      assertCallRecords(exotic.calls, [['enumerate']]);

      reset();
      exotic.iterator = createIteratorWithNext(() => 1);
      assertSame(captureSyncError(), 'Iterator result is not an object');
      assertCallRecords(exotic.calls, [['enumerate']]);

      reset();
      const doneAbrupt = new EngineObject(realm.intrinsics.objectPrototype);
      doneAbrupt.defineOwnProperty('done', {
        get: realm.createNativeFunction({
          name: 'get done',
          length: 0,
          call() {
            throw new GuestErrorSignal('TypeError', 'done abrupt');
          },
        }),
        enumerable: false,
        configurable: true,
      });
      exotic.iterator = createIteratorWithNext(() => doneAbrupt);
      assertSame(captureSyncError(), 'done abrupt');
      assertCallRecords(exotic.calls, [['enumerate']]);

      reset();
      const valueAbrupt = new EngineObject(realm.intrinsics.objectPrototype);
      valueAbrupt.defineOwnProperty('done', {
        value: false,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      valueAbrupt.defineOwnProperty('value', {
        get: realm.createNativeFunction({
          name: 'get value',
          length: 0,
          call() {
            throw new GuestErrorSignal('TypeError', 'value abrupt');
          },
        }),
        enumerable: false,
        configurable: true,
      });
      exotic.iterator = createIteratorWithNext(() => valueAbrupt);
      assertSame(captureSyncError(), 'value abrupt');
      assertCallRecords(exotic.calls, [['enumerate']]);
    },
  },
  {
    name: 'array identity does not follow a diagnostic class name',
    run() {
      const fake = new EngineObject();
      fake.getClassName = () => 'Array';
      fake.defineOwnProperty('0', {
        value: 'spoof',
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(isArrayObject(fake), false);
    },
  },
  {
    name: 'current exotic public descriptors preserve Array, String, and Arguments behavior',
    run() {
      const realm = createRealm();
      const array = new EngineArray(realm.intrinsics.arrayPrototype);

      assertSame(
        array.defineOwnProperty('2', {
          value: 'third',
          writable: true,
          enumerable: true,
          configurable: true,
        }),
        true,
      );
      assertSame(array.get('length', array), 3);
      assertSame(array.defineOwnProperty('length', { value: 1 }), true);
      assertSame(array.get('length', array), 1);
      assertSame(array.hasProperty('2'), false);

      const string = createPrimitiveWrapper(realm, 'hi');
      assertSame(string.get('0', string), 'h');
      assertSame(string.hasProperty('1'), true);
      assertSame(string.delete('0'), false);
      assertSame(string.ownPropertyKeys().map(String).join(','), '0,1,length');

      assertSame(
        evaluateScript(
          realm,
          'function mapped(a) {' +
            'arguments[0] = 2;' +
            'Object.defineProperty(arguments, "0", { writable: false });' +
            'a = 3;' +
            'var unmapped = arguments[0];' +
            'delete arguments[0];' +
            'return unmapped + ":" + typeof arguments[0] + ":" + a;' +
            '} mapped(1);',
        ).value,
        '2:undefined:3',
      );
    },
  },
  {
    name: 'semantic callers retain JSON mutation, language operators, and object reflection',
    run() {
      const realm = createRealm();
      const revived = /** @type {EngineObject} */ (
        evaluateScript(
          realm,
          'JSON.parse("[1,2]", function (key, value) {' +
            'return key === "0" ? undefined : key === "1" ? 3 : value;' +
            '});',
        ).value
      );

      assertSame(revived.get('length', revived), 2);
      assertSame(revived.hasProperty('0'), false);
      assertSame(revived.get('1', revived), 3);
      assertSame(
        evaluateScript(
          realm,
          'var proto = { inherited: 1 };' +
            'var object = Object.create(proto);' +
            'object.own = 2;' +
            'var withValue;' +
            'with (object) { withValue = inherited + own; }' +
            'var C = function C() {};' +
            'var instance = new C();' +
            'var before = Object.isExtensible(object);' +
            'Object.preventExtensions(object);' +
            'var ownDescriptor = Object.getOwnPropertyDescriptor(object, "own").value;' +
            '("inherited" in object) + ":" + withValue + ":" + ' +
            '(instance instanceof C) + ":" + before + ":" + ' +
            'Object.isExtensible(object) + ":" + ownDescriptor + ":" + ' +
            'Reflect.ownKeys(object).join(",");',
        ).value,
        'true:3:true:true:false:2:own',
      );
    },
  },
  {
    name: 'evaluator calls and construction retain native callable behavior',
    run() {
      const realm = createRealm();
      const native = realm.createNativeFunction({
        name: 'native',
        length: 1,
        call(_thisValue, args) {
          return /** @type {number} */ (args[0]) + 1;
        },
        construct(args) {
          const instance = new EngineObject(realm.intrinsics.objectPrototype);
          instance.defineOwnProperty('value', {
            value: args[0],
            writable: true,
            enumerable: true,
            configurable: true,
          });
          return instance;
        },
      });
      realm.globalObject.defineOwnProperty('native', {
        value: native,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(realm, 'native(4) + ":" + (new native(6)).value;').value,
        '5:6',
      );
    },
  },
];
