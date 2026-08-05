import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { ThrowSignal, GuestErrorSignal } from '../src/runtime/completion.js';

/**
 * @param {unknown} value
 * @param {string} constructorName
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @returns {void}
 */
function assertGuestErrorUsesPrototype(value, constructorName, realm) {
  if (!(value instanceof EngineObject)) {
    throw new Error(`Expected guest error object, got ${typeof value}`);
  }

  const ctor = /** @type {EngineObject} */ (
    realm.globalObject.get(constructorName)
  );
  const prototype = /** @type {EngineObject} */ (ctor.get('prototype'));

  let current = /** @type {EngineObject | null} */ (value.getPrototype());

  while (current !== null) {
    if (current === prototype) {
      return;
    }

    current = current.getPrototype();
  }

  throw new Error(
    `Expected thrown value to inherit from ${constructorName}.prototype`,
  );
}

/**
 * @template T
 * @param {T | undefined} value
 * @param {string} message
 * @returns {T}
 */
function expectDefined(value, message) {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

const tests = [
  {
    name: 'realm native-function factory creates callable-only built-ins with realm-local identity and descriptors',
    run() {
      const realm = createRealm();
      const fn = realm.createNativeFunction({
        name: 'sample',
        length: 2,
        call(thisValue, args) {
          return `${thisValue}:${args.length}`;
        },
      });

      assertSame(fn.getPrototype(), realm.intrinsics.functionPrototype);
      assertSame(fn.callFunction('receiver', [1, 2, 3]), 'receiver:3');

      const nameDescriptor = expectDefined(
        fn.getOwnProperty('name'),
        'Expected native function name descriptor',
      );
      assertSame(nameDescriptor.value, 'sample');
      assertSame(nameDescriptor.writable, false);
      assertSame(nameDescriptor.enumerable, false);
      assertSame(nameDescriptor.configurable, false);

      const lengthDescriptor = expectDefined(
        fn.getOwnProperty('length'),
        'Expected native function length descriptor',
      );
      assertSame(lengthDescriptor.value, 2);
      assertSame(lengthDescriptor.writable, false);
      assertSame(lengthDescriptor.enumerable, false);
      assertSame(lengthDescriptor.configurable, false);

      assertSame(fn.getOwnProperty('prototype'), undefined);

      const signal = /** @type {ThrowSignal} */ (
        assertThrows(() => fn.constructFunction([]), ThrowSignal)
      );
      assertGuestErrorUsesPrototype(signal.value, 'TypeError', realm);
    },
  },
  {
    name: 'realm native-function factory keeps call and construct behavior distinct',
    run() {
      const realm = createRealm();
      const prototype = new EngineObject(realm.intrinsics.objectPrototype);
      /** @type {string[]} */
      const trace = [];
      const fn = realm.createNativeFunction({
        name: 'Widget',
        length: 1,
        prototype,
        call(_thisValue, args) {
          trace.push(`call:${args.length}`);
          return 'called';
        },
        construct(args) {
          trace.push(`construct:${args.length}`);
          const instance = new EngineObject(prototype);
          instance.defineOwnProperty('createdWith', {
            value: args[0],
            writable: true,
            enumerable: true,
            configurable: true,
          });
          return instance;
        },
      });

      assertSame(fn.callFunction(undefined, ['x']), 'called');
      const instance = /** @type {EngineObject} */ (
        fn.constructFunction(['y'])
      );
      assertSame(JSON.stringify(trace), '["call:1","construct:1"]');
      assertSame(instance.getPrototype(), prototype);
      assertSame(instance.get('createdWith'), 'y');

      const prototypeDescriptor = expectDefined(
        fn.getOwnProperty('prototype'),
        'Expected native function prototype descriptor',
      );
      assertSame(prototypeDescriptor.value, prototype);
      assertSame(prototypeDescriptor.writable, false);
      assertSame(prototypeDescriptor.enumerable, false);
      assertSame(prototypeDescriptor.configurable, false);
    },
  },
  {
    name: 'constructible native built-ins participate in guest instanceof checks',
    run() {
      const realm = createRealm();
      const prototype = new EngineObject(realm.intrinsics.objectPrototype);
      const fn = realm.createNativeFunction({
        name: 'Widget',
        length: 0,
        prototype,
        call() {
          return undefined;
        },
        construct() {
          return new EngineObject(prototype);
        },
      });
      realm.globalObject.defineOwnProperty('Widget', {
        value: fn,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const result = evaluateScript(realm, 'new Widget() instanceof Widget;');
      assertSame(result.type, 'normal');
      assertSame(result.value, true);
    },
  },
  {
    name: 'native built-ins convert GuestErrorSignal throws into realm-local guest errors',
    run() {
      const realmOne = createRealm();
      const realmTwo = createRealm();
      /**
       * @param {import('../src/runtime/realm.js').Realm} realm
       * @returns {import('../src/builtins/shared.js').NativeFunction}
       */
      const makeThrower = (realm) =>
        realm.createNativeFunction({
          name: 'explode',
          length: 0,
          call() {
            throw new GuestErrorSignal('TypeError', 'boom');
          },
        });

      const first = /** @type {ThrowSignal} */ (
        assertThrows(
          () => makeThrower(realmOne).callFunction(undefined),
          ThrowSignal,
        )
      );
      const second = /** @type {ThrowSignal} */ (
        assertThrows(
          () => makeThrower(realmTwo).callFunction(undefined),
          ThrowSignal,
        )
      );

      assertGuestErrorUsesPrototype(first.value, 'TypeError', realmOne);
      assertGuestErrorUsesPrototype(second.value, 'TypeError', realmTwo);
      assertSame(first.value === second.value, false);
    },
  },
  {
    name: 'toPropertyDescriptor reads data fields in ES5 order',
    async run() {
      const realm = createRealm();
      const { toPropertyDescriptor } =
        await import('../src/builtins/shared.js');
      /** @type {string[]} */
      const trace = [];
      const descriptor = new EngineObject(realm.intrinsics.objectPrototype);

      /** @type {readonly [string, unknown][]} */
      const fields = [
        ['enumerable', 1],
        ['configurable', 0],
        ['value', 42],
        ['writable', ''],
      ];

      for (const [name, value] of fields) {
        descriptor.defineOwnProperty(name, {
          get() {
            trace.push(name);
            return value;
          },
          enumerable: true,
          configurable: true,
        });
      }

      const record = toPropertyDescriptor(descriptor);
      assertSame(
        JSON.stringify(trace),
        '["enumerable","configurable","value","writable"]',
      );
      assertSame(record.enumerable, true);
      assertSame(record.configurable, false);
      assertSame(record.value, 42);
      assertSame(record.writable, false);
    },
  },
  {
    name: 'toPropertyDescriptor accepts callable accessor fields',
    async run() {
      const realm = createRealm();
      const { toPropertyDescriptor } =
        await import('../src/builtins/shared.js');
      const getter = realm.createNativeFunction({
        name: 'getter',
        length: 0,
        call() {
          return 1;
        },
      });
      const setter = realm.createNativeFunction({
        name: 'setter',
        length: 1,
        call() {
          return undefined;
        },
      });
      const descriptor = new EngineObject(realm.intrinsics.objectPrototype);
      descriptor.defineOwnProperty('get', {
        value: getter,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      descriptor.defineOwnProperty('set', {
        value: setter,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const record = toPropertyDescriptor(descriptor);
      assertSame(record.get, getter);
      assertSame(record.set, setter);
    },
  },
  {
    name: 'toPropertyDescriptor propagates guest failures and rejects invalid getters',
    async run() {
      const realm = createRealm();
      const { toPropertyDescriptor } =
        await import('../src/builtins/shared.js');
      const throwing = new EngineObject(realm.intrinsics.objectPrototype);
      const sentinel = new EngineObject(realm.intrinsics.objectPrototype);
      throwing.defineOwnProperty('enumerable', {
        get() {
          throw new ThrowSignal(sentinel);
        },
        enumerable: true,
        configurable: true,
      });

      const thrown = /** @type {ThrowSignal} */ (
        assertThrows(() => toPropertyDescriptor(throwing), ThrowSignal)
      );
      assertSame(thrown.value, sentinel);

      const invalid = new EngineObject(realm.intrinsics.objectPrototype);
      invalid.defineOwnProperty('get', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertThrows(() => toPropertyDescriptor(invalid), GuestErrorSignal);
    },
  },
  {
    name: 'toPropertyDescriptor gets each present field once and ignores absent fields',
    async run() {
      const realm = createRealm();
      const { toPropertyDescriptor } =
        await import('../src/builtins/shared.js');
      /** @type {string[]} */
      const trace = [];
      const prototype = new EngineObject(realm.intrinsics.objectPrototype);
      prototype.defineOwnProperty('enumerable', {
        get() {
          trace.push('get:enumerable');
          return 1;
        },
        enumerable: true,
        configurable: true,
      });
      const descriptor = new EngineObject(prototype);
      descriptor.defineOwnProperty('value', {
        get() {
          trace.push('get:value');
          return 42;
        },
        enumerable: true,
        configurable: true,
      });

      const record = toPropertyDescriptor(descriptor);

      assertSame(JSON.stringify(trace), '["get:enumerable","get:value"]');
      assertSame(record.enumerable, true);
      assertSame(record.value, 42);
      assertSame('configurable' in record, false);
      assertSame('writable' in record, false);
      assertSame('get' in record, false);
      assertSame('set' in record, false);
    },
  },
  {
    name: 'fromPropertyDescriptor materializes guest descriptor objects with only present fields',
    async run() {
      const realm = createRealm();
      const { fromPropertyDescriptor } =
        await import('../src/builtins/shared.js');
      const getter = realm.createNativeFunction({
        name: 'getter',
        length: 0,
        call() {
          return 1;
        },
      });

      assertSame(fromPropertyDescriptor(realm, undefined), undefined);

      const object = expectDefined(
        fromPropertyDescriptor(realm, {
          get: getter,
          enumerable: true,
          configurable: false,
        }),
        'Expected descriptor object',
      );

      assertSame(object instanceof EngineObject, true);
      assertSame(object.get('get'), getter);
      assertSame(object.get('set'), undefined);
      assertSame(object.get('enumerable'), true);
      assertSame(object.get('configurable'), false);
      assertSame(object.hasProperty('value'), false);
      assertSame(object.hasProperty('writable'), false);
    },
  },
  {
    name: 'fromPropertyDescriptor leaves generic descriptors generic',
    async run() {
      const realm = createRealm();
      const { fromPropertyDescriptor } =
        await import('../src/builtins/shared.js');

      const object = expectDefined(
        fromPropertyDescriptor(realm, {
          enumerable: true,
          configurable: false,
        }),
        'Expected descriptor object',
      );

      assertSame(object.get('enumerable'), true);
      assertSame(object.get('configurable'), false);
      assertSame(object.hasProperty('value'), false);
      assertSame(object.hasProperty('writable'), false);
      assertSame(object.hasProperty('get'), false);
      assertSame(object.hasProperty('set'), false);
    },
  },
  {
    name: 'createListFromArrayLike can preserve inherited values and sparse holes',
    async run() {
      const realm = createRealm();
      const { createListFromArrayLike } =
        await import('../src/builtins/shared.js');
      const prototype = new EngineObject(realm.intrinsics.objectPrototype);
      prototype.defineOwnProperty('1', {
        get() {
          return 'inherited';
        },
        enumerable: true,
        configurable: true,
      });
      const arrayLike = new EngineObject(prototype);
      arrayLike.defineOwnProperty('0', {
        value: 'zero',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      arrayLike.defineOwnProperty('length', {
        value: 3,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const dense = createListFromArrayLike(arrayLike);
      assertSame(dense.length, 3);
      assertSame(dense[0], 'zero');
      assertSame(dense[1], 'inherited');
      assertSame(dense[2], undefined);
      assertSame(2 in dense, true);

      const sparse = createListFromArrayLike(arrayLike, {
        preserveHoles: true,
      });
      assertSame(sparse.length, 3);
      assertSame(sparse[0], 'zero');
      assertSame(sparse[1], 'inherited');
      assertSame(2 in sparse, false);
    },
  },
  {
    name: 'shared receiver and callability guards accept valid inputs and throw guest type errors otherwise',
    async run() {
      const realm = createRealm();
      const { requireCallable, requireConstructor, requireObjectReceiver } =
        await import('../src/builtins/shared.js');
      const callableOnly = realm.createNativeFunction({
        name: 'callableOnly',
        length: 0,
        call() {
          return undefined;
        },
      });
      const constructible = realm.createNativeFunction({
        name: 'Constructible',
        length: 0,
        prototype: new EngineObject(realm.intrinsics.objectPrototype),
        call() {
          return undefined;
        },
        construct() {
          return new EngineObject(realm.intrinsics.objectPrototype);
        },
      });
      const receiver = new EngineObject(realm.intrinsics.objectPrototype);

      assertSame(
        requireCallable(callableOnly, 'callable') === callableOnly,
        true,
      );
      assertSame(
        requireConstructor(constructible, 'constructor') === constructible,
        true,
      );
      assertSame(
        requireObjectReceiver(receiver, 'receiver') === receiver,
        true,
      );

      assertThrows(() => requireCallable(1, 'callable'), GuestErrorSignal);
      assertThrows(
        () => requireConstructor(callableOnly, 'constructor'),
        GuestErrorSignal,
      );
      assertThrows(
        () => requireObjectReceiver(1, 'receiver'),
        GuestErrorSignal,
      );
    },
  },
];

export default tests;
