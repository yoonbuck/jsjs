import { assertSame, assertThrows } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import {
  EngineObject,
  currentObjectOperationRealm,
} from '../src/runtime/object.js';
import { GuestErrorSignal, ThrowSignal } from '../src/runtime/completion.js';
import {
  createIterResultObject,
  getIterator,
  getMethod,
  iteratorClose,
  iteratorComplete,
  iteratorStep,
  iteratorValue,
} from '../src/runtime/iterator.js';

/**
 * Evaluates `source` in a fresh realm and returns the completion's value,
 * failing loudly if it threw.
 *
 * @param {string} source
 * @returns {unknown}
 */
function evalValue(source) {
  const completion = evaluateScript(createRealm(), source);
  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }
  return completion.value;
}

/**
 * Builds a guest iterator object over the JS values `items`, whose `next`
 * yields `{ value, done }` result objects and whose optional `return` records
 * that it was called. Returned alongside are the closures' observable counters.
 *
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {readonly unknown[]} items
 * @param {{ withReturn?: boolean, returnThrows?: boolean, returnResult?: unknown }} [options]
 */
function makeIterator(realm, items, options = {}) {
  const state = { nextCalls: 0, returnCalls: 0, index: 0 };
  const iterator = new EngineObject(realm.intrinsics.objectPrototype);

  iterator.defineOwnProperty('next', {
    value: realm.createNativeFunction({
      name: 'next',
      length: 0,
      call() {
        state.nextCalls += 1;
        if (state.index >= items.length) {
          return createIterResultObject(realm, undefined, true);
        }
        const value = items[state.index];
        state.index += 1;
        return createIterResultObject(realm, value, false);
      },
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  if (options.withReturn) {
    iterator.defineOwnProperty('return', {
      value: realm.createNativeFunction({
        name: 'return',
        length: 1,
        call() {
          state.returnCalls += 1;
          if (options.returnThrows) {
            throw new GuestErrorSignal('TypeError', 'return blew up');
          }
          if ('returnResult' in options) {
            return options.returnResult;
          }
          return createIterResultObject(realm, undefined, true);
        },
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  return { iterator, state };
}

/**
 * Wraps `iterator` in an iterable whose `@@iterator` returns it.
 *
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {EngineObject} iterator
 * @returns {EngineObject}
 */
function makeIterable(realm, iterator) {
  const iterable = new EngineObject(realm.intrinsics.objectPrototype);
  iterable.defineOwnProperty(realm.agent.wellKnownSymbols.iterator, {
    value: realm.createNativeFunction({
      name: '[Symbol.iterator]',
      length: 0,
      call() {
        return iterator;
      },
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return iterable;
}

/**
 * @param {() => unknown} body
 * @returns {GuestErrorSignal}
 */
function captureGuestTypeError(body) {
  try {
    body();
  } catch (error) {
    if (error instanceof GuestErrorSignal && error.typeName === 'TypeError') {
      return error;
    }
    throw error instanceof Error
      ? error
      : new Error(`Expected a guest TypeError, got ${String(error)}`);
  }
  throw new Error('Expected a guest TypeError, but nothing was thrown');
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'GetMethod preserves a primitive receiver for strict iterator getters',
    run() {
      assertSame(
        evalValue(
          '"use strict"; var seen; Object.defineProperty(String.prototype, ' +
            'Symbol.iterator, { get: function () { seen = typeof this; ' +
            'return function () { return { next: function () { return { done: true }; } }; }; } }); ' +
            'for (var value of "x") {} seen;',
        ),
        'string',
      );
    },
  },
  {
    name: 'iterator Gets scope their caller Realm across Agents and preserve receivers',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const targetRealm = createRealm({ agent: createAgent() });
      const accessorRealm = createRealm({ agent: createAgent() });
      /** @type {string[]} */
      const observedGets = [];
      /**
       * @param {string} name
       * @param {EngineObject} receiver
       * @param {unknown} value
       */
      const createGetter = (name, receiver, value) =>
        accessorRealm.createNativeFunction({
          name: `get ${name}`,
          length: 0,
          call(thisValue, _args, _functionObject, caller) {
            observedGets.push(name);
            assertSame(thisValue, receiver);
            assertSame(caller, callerRealm);
            assertSame(
              callerRealm.agent.synchronousCallChainRoot(),
              accessorRealm.agent.synchronousCallChainRoot(),
            );
            return value;
          },
        });
      const methodTarget = new EngineObject(
        targetRealm.intrinsics.objectPrototype,
      );
      const method = accessorRealm.createNativeFunction({
        name: 'method',
        length: 0,
        call() {
          return undefined;
        },
      });
      methodTarget.defineOwnProperty('method', {
        get: createGetter('method', methodTarget, method),
        enumerable: true,
        configurable: true,
      });

      assertSame(getMethod(callerRealm, methodTarget, 'method'), method);

      const iterator = new EngineObject(targetRealm.intrinsics.objectPrototype);
      const next = accessorRealm.createNativeFunction({
        name: 'next',
        length: 0,
        call() {
          return new EngineObject(targetRealm.intrinsics.objectPrototype);
        },
      });
      iterator.defineOwnProperty('next', {
        get: createGetter('next', iterator, next),
        enumerable: true,
        configurable: true,
      });
      const iteratorMethod = targetRealm.createNativeFunction({
        name: '[Symbol.iterator]',
        length: 0,
        call() {
          return iterator;
        },
      });
      const record = getIterator(callerRealm, iterator, iteratorMethod);

      assertSame(record.nextMethod, next);

      const result = new EngineObject(targetRealm.intrinsics.objectPrototype);
      result.defineOwnProperty('done', {
        get: createGetter('done', result, false),
        enumerable: true,
        configurable: true,
      });
      result.defineOwnProperty('value', {
        get: createGetter('value', result, 'value'),
        enumerable: true,
        configurable: true,
      });

      assertSame(iteratorComplete(result, callerRealm), false);
      assertSame(iteratorValue(result, callerRealm), 'value');

      const closable = new EngineObject(targetRealm.intrinsics.objectPrototype);
      const closeResult = new EngineObject(
        targetRealm.intrinsics.objectPrototype,
      );
      const closeMethod = accessorRealm.createNativeFunction({
        name: 'return',
        length: 0,
        call() {
          return closeResult;
        },
      });
      closable.defineOwnProperty('return', {
        get: createGetter('return', closable, closeMethod),
        enumerable: true,
        configurable: true,
      });

      iteratorClose(
        callerRealm,
        { iterator: closable, nextMethod: undefined, done: false },
        false,
      );
      assertSame(observedGets.join(','), 'method,next,done,value,return');

      const abruptResult = new EngineObject(
        targetRealm.intrinsics.objectPrototype,
      );
      /** @type {import('../src/runtime/realm.js').Realm | null} */
      let abruptCaller = null;
      const abruptGetter = accessorRealm.createNativeFunction({
        name: 'get value',
        length: 0,
        call(thisValue, _args, _functionObject, caller) {
          abruptCaller = caller ?? null;
          assertSame(thisValue, abruptResult);
          assertSame(caller, callerRealm);
          assertSame(
            callerRealm.agent.synchronousCallChainRoot(),
            accessorRealm.agent.synchronousCallChainRoot(),
          );
          throw new GuestErrorSignal(
            'TypeError',
            'abrupt iterator value getter',
          );
        },
      });
      abruptResult.defineOwnProperty('value', {
        get: abruptGetter,
        enumerable: true,
        configurable: true,
      });

      assertThrows(() => iteratorValue(abruptResult, callerRealm), ThrowSignal);
      assertSame(abruptCaller, callerRealm);
      assertSame(currentObjectOperationRealm(), undefined);
      assertSame(callerRealm.agent.activeExecutionRealm, null);
      assertSame(targetRealm.agent.activeExecutionRealm, null);
      assertSame(accessorRealm.agent.activeExecutionRealm, null);
      assertSame(callerRealm.agent.synchronousCallChainRoot(), null);
      assertSame(targetRealm.agent.synchronousCallChainRoot(), null);
      assertSame(accessorRealm.agent.synchronousCallChainRoot(), null);
    },
  },
  {
    name: 'Array iterator indexed accessors receive the iterated array',
    run() {
      assertSame(
        evalValue(
          'var array = [0]; Object.defineProperty(array, "0", {' +
            'get: function () { return this === array; } }); ' +
            'array.values().next().value;',
        ),
        true,
      );
    },
  },
  {
    name: 'CreateIterResultObject builds a mutable value/done result',
    run() {
      const realm = createRealm();
      const result = createIterResultObject(realm, 42, false);
      assertSame(result.get('value'), 42);
      assertSame(result.get('done'), false);
      assertSame(result.getPrototypeOf(), realm.intrinsics.objectPrototype);
      const descriptor = /** @type {any} */ (result.getOwnProperty('value'));
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'GetMethod returns undefined for a null or undefined property',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      assertSame(getMethod(realm, object, 'missing'), undefined);
      object.defineOwnProperty('nullish', {
        value: null,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(getMethod(realm, object, 'nullish'), undefined);
    },
  },
  {
    name: 'GetMethod throws a TypeError for a non-callable property',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      object.defineOwnProperty('m', {
        value: 5,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      captureGuestTypeError(() => getMethod(realm, object, 'm'));
    },
  },
  {
    name: 'GetIterator throws for a non-iterable object',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      captureGuestTypeError(() => getIterator(realm, object));
    },
  },
  {
    name: 'GetIterator throws when @@iterator returns a non-object',
    run() {
      const realm = createRealm();
      const iterable = new EngineObject(realm.intrinsics.objectPrototype);
      iterable.defineOwnProperty(realm.agent.wellKnownSymbols.iterator, {
        value: realm.createNativeFunction({
          name: '[Symbol.iterator]',
          length: 0,
          call() {
            return 7;
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      captureGuestTypeError(() => getIterator(realm, iterable));
    },
  },
  {
    name: 'IteratorStep/IteratorValue drive an iterator to completion',
    run() {
      const realm = createRealm();
      const { iterator } = makeIterator(realm, ['a', 'b']);
      const iterable = makeIterable(realm, iterator);
      const record = getIterator(realm, iterable);

      const first = iteratorStep(record);
      assertSame(first !== false, true);
      assertSame(iteratorValue(/** @type {EngineObject} */ (first)), 'a');

      const second = iteratorStep(record);
      assertSame(iteratorValue(/** @type {EngineObject} */ (second)), 'b');

      assertSame(iteratorStep(record), false);
    },
  },
  {
    name: 'IteratorComplete coerces done with ToBoolean',
    run() {
      const realm = createRealm();
      const result = createIterResultObject(realm, undefined, false);
      assertSame(result.set('done', '', result), true);
      assertSame(iteratorComplete(result), false);
      assertSame(result.set('done', 'yes', result), true);
      assertSame(iteratorComplete(result), true);
    },
  },
  {
    name: 'IteratorClose is a no-op when the iterator has no return method',
    run() {
      const realm = createRealm();
      const { iterator, state } = makeIterator(realm, [1]);
      iteratorClose(
        realm,
        { iterator, nextMethod: iterator.get('next'), done: false },
        false,
      );
      assertSame(state.returnCalls, 0);
    },
  },
  {
    name: 'IteratorClose calls return once for a normal completion',
    run() {
      const realm = createRealm();
      const { iterator, state } = makeIterator(realm, [1], {
        withReturn: true,
      });
      iteratorClose(
        realm,
        { iterator, nextMethod: iterator.get('next'), done: false },
        false,
      );
      assertSame(state.returnCalls, 1);
    },
  },
  {
    name: 'IteratorClose throws TypeError when return yields a non-object (normal completion)',
    run() {
      const realm = createRealm();
      const { iterator } = makeIterator(realm, [1], {
        withReturn: true,
        returnResult: 3,
      });
      captureGuestTypeError(() =>
        iteratorClose(
          realm,
          { iterator, nextMethod: iterator.get('next'), done: false },
          false,
        ),
      );
    },
  },
  {
    name: 'IteratorClose propagates a throwing return for a normal completion',
    run() {
      const realm = createRealm();
      const { iterator } = makeIterator(realm, [1], {
        withReturn: true,
        returnThrows: true,
      });
      let threw = false;
      try {
        iteratorClose(
          realm,
          { iterator, nextMethod: iterator.get('next'), done: false },
          false,
        );
      } catch (error) {
        threw =
          error instanceof ThrowSignal || error instanceof GuestErrorSignal;
      }
      assertSame(threw, true);
    },
  },
  {
    name: 'IteratorClose swallows a throwing return when the completion is itself a throw',
    run() {
      const realm = createRealm();
      const { iterator, state } = makeIterator(realm, [1], {
        withReturn: true,
        returnThrows: true,
      });
      // completionIsThrow=true: the original throw wins, so this must not raise.
      iteratorClose(
        realm,
        { iterator, nextMethod: iterator.get('next'), done: false },
        true,
      );
      assertSame(state.returnCalls, 1);
    },
  },
  {
    name: 'Array.prototype has values/keys/entries and @@iterator === values',
    run() {
      assertSame(evalValue('typeof Array.prototype.values'), 'function');
      assertSame(evalValue('typeof Array.prototype.keys'), 'function');
      assertSame(evalValue('typeof Array.prototype.entries'), 'function');
      assertSame(
        evalValue(
          'Array.prototype[Symbol.iterator] === Array.prototype.values',
        ),
        true,
      );
      assertSame(evalValue('Array.prototype.values.length'), 0);
      assertSame(evalValue('Array.prototype.values.name'), 'values');
    },
  },
  {
    name: 'an array value iterator walks its elements then reports done',
    run() {
      assertSame(
        evalValue(
          'var it = [10, 20][Symbol.iterator]();' +
            'var a = it.next(); var b = it.next(); var c = it.next();' +
            '[a.value, a.done, b.value, b.done, c.value, c.done].join(",")',
        ),
        '10,false,20,false,,true',
      );
    },
  },
  {
    name: 'array key and entries iterators yield indices and pairs',
    run() {
      assertSame(evalValue('["a","b"].keys().next().value'), 0);
      assertSame(
        evalValue(
          'var e = ["a","b"].entries().next().value;' +
            'e.length + ":" + e[0] + ":" + e[1]',
        ),
        '2:0:a',
      );
    },
  },
  {
    name: 'an array iterator inherits %ArrayIteratorPrototype% and %IteratorPrototype%',
    run() {
      assertSame(
        evalValue(
          'var it = [][Symbol.iterator]();' +
            'var proto = Object.getPrototypeOf(it);' +
            'proto[Symbol.toStringTag]',
        ),
        'Array Iterator',
      );
      assertSame(
        evalValue(
          'var it = [][Symbol.iterator]();' +
            'var iterProto = Object.getPrototypeOf(Object.getPrototypeOf(it));' +
            'iterProto[Symbol.iterator].call(it) === it',
        ),
        true,
      );
    },
  },
  {
    name: 'array iterator next rejects a foreign receiver',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        '[][Symbol.iterator]().next.call({})',
      );
      assertSame(completion.type, 'throw');
    },
  },
  {
    name: 'a string iterator yields code points, combining surrogate pairs',
    run() {
      assertSame(
        evalValue(
          'var it = "a\\uD83D\\uDE00b"[Symbol.iterator]();' +
            'var out = []; var step = it.next();' +
            'while (!step.done) { out.push(step.value.length); step = it.next(); }' +
            'out.join(",")',
        ),
        '1,2,1',
      );
    },
  },
  {
    name: 'string iterators are realm-correct',
    run() {
      const realm = createRealm();
      const arrayIterator = /** @type {EngineObject} */ (
        evaluateScript(realm, '[][Symbol.iterator]()').value
      );
      const otherRealm = createRealm();
      // Distinct realms mint distinct %ArrayIteratorPrototype% identities.
      assertSame(
        arrayIterator.getPrototypeOf() ===
          otherRealm.intrinsics.arrayIteratorPrototype,
        false,
      );
      assertSame(
        arrayIterator.getPrototypeOf() ===
          realm.intrinsics.arrayIteratorPrototype,
        true,
      );
    },
  },
];

export default tests;
