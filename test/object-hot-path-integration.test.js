import { assertSame, assertThrows } from './harness/assert.js';
import { evaluateScript } from '../src/api.js';
import { EngineArray } from '../src/runtime/array-object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { DeclarativeEnvironmentRecord } from '../src/runtime/environment.js';
import { ArgumentsObject } from '../src/runtime/function-object.js';
import {
  EngineObject,
  defineOwnPropertyOrThrow,
} from '../src/runtime/object.js';
import { EnginePrimitiveObject } from '../src/runtime/primitive-object.js';
import { createRealm } from '../src/runtime/realm.js';

/**
 * @param {{ getOwnProperty: (name: import('../src/runtime/descriptors.js').PropertyKey) => import('../src/runtime/descriptors.js').CompletePropertyDescriptor | undefined }} target
 * @param {import('../src/runtime/descriptors.js').PropertyKey} name
 * @param {string} message
 * @returns {import('../src/runtime/descriptors.js').CompletePropertyDescriptor}
 */
function publicDescriptor(target, name, message) {
  const descriptor = target.getOwnProperty(name);
  if (descriptor === undefined) {
    assertSame(descriptor === undefined, false, message);
    throw new Error('unreachable');
  }
  return descriptor;
}

/**
 * @param {() => unknown} body
 * @returns {void}
 */
function assertGuestTypeError(body) {
  const error = /** @type {GuestErrorSignal} */ (
    assertThrows(body, GuestErrorSignal)
  );
  assertSame(error.typeName, 'TypeError');
}

/**
 * @param {object} target
 * @param {import('../src/runtime/descriptors.js').PropertyKey} name
 * @param {string} message
 * @returns {import('../src/runtime/descriptors.js').CompletePropertyDescriptor}
 */
function peekOwnDescriptor(target, name, message) {
  // Raw descriptors must be reacquired after mutation; do not retain them.
  const peek =
    /** @type {{ _peekOwnDescriptor?: (name: import('../src/runtime/descriptors.js').PropertyKey) => import('../src/runtime/descriptors.js').CompletePropertyDescriptor | undefined }} */ (
      target
    )._peekOwnDescriptor;
  if (typeof peek !== 'function') {
    assertSame(typeof peek, 'function', message);
    throw new Error('unreachable');
  }
  const descriptor = peek.call(target, name);
  if (descriptor === undefined) {
    assertSame(
      descriptor === undefined,
      false,
      `${message}: missing ${String(name)}`,
    );
    throw new Error('unreachable');
  }
  return descriptor;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function runScript(realm, source) {
  const result = evaluateScript(realm, source);
  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }
  return result.value;
}

const tests = [
  {
    name: 'value-only updates support symbol keys without exposing stored descriptors',
    run() {
      const key = Symbol('hot');
      const object = new EngineObject();
      object.defineOwnProperty(key, {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(object.set(key, 2, object), true);

      const descriptor = publicDescriptor(
        object,
        key,
        'EngineObject should publish a detached public descriptor for symbol keys',
      );
      descriptor.value = 99;

      assertSame(
        publicDescriptor(
          object,
          key,
          'public symbol descriptors must stay detached after value-only updates',
        ).value,
        2,
      );
      assertSame(object.ownPropertyKeys()[0], key);
      assertSame(
        peekOwnDescriptor(
          object,
          key,
          'the raw symbol-key descriptor should keep the stored value after public descriptor mutation',
        ).value,
        2,
      );
    },
  },
  {
    name: 'mixed ordering and array symbol writes stay on the non-index descriptor path',
    run() {
      const first = Symbol('first');
      const second = Symbol('second');
      const object = new EngineObject();
      assertSame(object.set('name', 1, object), true);
      assertSame(object.set(first, 2, object), true);
      assertSame(object.set('2', 3, object), true);
      assertSame(object.set(second, 4, object), true);

      assertSame(
        JSON.stringify(object.ownPropertyKeys().map(String)),
        '["2","name","Symbol(first)","Symbol(second)"]',
      );
      assertSame(
        peekOwnDescriptor(
          object,
          first,
          'EngineObject should expose mixed-order symbol descriptors to the hot-path protocol',
        ).value,
        2,
      );
      assertSame(
        peekOwnDescriptor(
          object,
          second,
          'EngineObject should preserve later symbol descriptors in mixed own-key order',
        ).value,
        4,
      );

      const array = new EngineArray();
      assertSame(array.set(first, 1, array), true);

      assertSame(array.get('length'), 0);
      assertSame(array.get(first), 1);
      assertSame(
        peekOwnDescriptor(
          array,
          first,
          'EngineArray should keep symbol writes on the non-index descriptor path',
        ).value,
        1,
      );
    },
  },
  {
    name: 'super reads use prototype hot-path descriptors instead of detached public copies',
    run() {
      const realm = createRealm();
      let liveCalls = 0;
      let detachedCalls = 0;
      const liveGetter = realm.createNativeFunction({
        name: 'liveProtoGetter',
        length: 0,
        call() {
          liveCalls += 1;
          return 17;
        },
      });
      const detachedGetter = realm.createNativeFunction({
        name: 'detachedProtoGetter',
        length: 0,
        call() {
          detachedCalls += 1;
          return 99;
        },
      });
      const prototype = new EngineObject(realm.intrinsics.objectPrototype);
      prototype.defineOwnProperty('x', {
        get: liveGetter,
        set: undefined,
        enumerable: true,
        configurable: true,
      });
      const object = /** @type {EngineObject} */ (
        runScript(realm, '({ get value() { return super.x; } });')
      );
      object.setPrototypeOf(prototype);

      const descriptor = publicDescriptor(
        prototype,
        'x',
        'prototype accessors must stay detached for super reads',
      );
      descriptor.get = detachedGetter;

      assertSame(object.get('value'), 17);
      assertSame(liveCalls, 1);
      assertSame(detachedCalls, 0);
      assertSame(
        peekOwnDescriptor(
          prototype,
          'x',
          'super reads should still use the stored prototype accessor',
        ).get,
        liveGetter,
      );
    },
  },
  {
    name: 'mapped arguments expose the same live descriptor through public and hot-path reads',
    run() {
      const realm = createRealm();
      const environment = new DeclarativeEnvironmentRecord();
      environment.createMutableBinding('value');
      environment.initializeBinding('value', 1);
      const argumentsObject = new ArgumentsObject(
        realm.intrinsics.objectPrototype,
        environment,
      );

      argumentsObject.mapParameter('0', 'value');
      argumentsObject.defineOwnProperty('0', {
        value: 7,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(environment.getBindingValue('value', false), 7);

      environment.setMutableBinding('value', 8, false);

      const descriptor = publicDescriptor(
        argumentsObject,
        '0',
        'ArgumentsObject should publish mapped index descriptors through getOwnProperty',
      );
      assertSame(descriptor.value, 8);
      descriptor.value = 99;

      assertSame(
        publicDescriptor(
          argumentsObject,
          '0',
          'mapped public descriptors must stay detached from later reads',
        ).value,
        8,
      );
      assertSame(
        peekOwnDescriptor(
          argumentsObject,
          '0',
          'ArgumentsObject should expose mapped indices through the hot-path descriptor protocol',
        ).value,
        8,
      );
    },
  },
  {
    name: 'identifier fast-path reads ignore detached public descriptor mutations',
    run() {
      const realm = createRealm();
      let liveCalls = 0;
      let detachedCalls = 0;
      const liveGetter = realm.createNativeFunction({
        name: 'liveGlobalGetter',
        length: 0,
        call() {
          liveCalls += 1;
          return 'live';
        },
      });
      const detachedGetter = realm.createNativeFunction({
        name: 'detachedGlobalGetter',
        length: 0,
        call() {
          detachedCalls += 1;
          return 'detached';
        },
      });
      realm.globalObject.defineOwnProperty('probe', {
        get: liveGetter,
        set: undefined,
        enumerable: true,
        configurable: true,
      });

      const descriptor = publicDescriptor(
        realm.globalObject,
        'probe',
        'global accessor descriptors must stay detached for identifier fast-path reads',
      );
      descriptor.get = detachedGetter;

      assertSame(runScript(realm, 'probe;'), 'live');
      assertSame(liveCalls, 1);
      assertSame(detachedCalls, 0);
      assertSame(
        peekOwnDescriptor(
          realm.globalObject,
          'probe',
          'identifier fast-path reads should still use the stored global accessor',
        ).get,
        liveGetter,
      );
    },
  },
  {
    name: 'virtual string indices expose the same fallback through public and hot-path reads',
    run() {
      const realm = createRealm();
      const stringObject = new EnginePrimitiveObject(
        realm.intrinsics.stringPrototype,
        'ab',
      );

      assertSame(stringObject.defineOwnProperty('0', { value: 'x' }), false);
      assertGuestTypeError(() =>
        defineOwnPropertyOrThrow(stringObject, '0', { value: 'x' }),
      );

      const descriptor = publicDescriptor(
        stringObject,
        '0',
        'EnginePrimitiveObject should publish virtual string index descriptors',
      );
      assertSame(descriptor.value, 'a');
      descriptor.value = 'z';

      assertSame(
        publicDescriptor(
          stringObject,
          '0',
          'virtual string index descriptors must stay detached from public mutations',
        ).value,
        'a',
      );
      assertSame(
        peekOwnDescriptor(
          stringObject,
          '0',
          'EnginePrimitiveObject should expose virtual string indices through the hot-path descriptor protocol',
        ).value,
        'a',
      );
    },
  },
];

export default tests;
