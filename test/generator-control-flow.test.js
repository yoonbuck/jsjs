import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { createAgent } from '../src/runtime/agent.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { createIterResultObject } from '../src/runtime/iterator.js';
import { callCallable } from '../src/runtime/capabilities.js';
import { HostileExotic } from './harness/hostile-exotic.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);

  if (completion.type !== 'normal') {
    const detail =
      completion.value instanceof EngineObject
        ? `: ${String(completion.value.get('name'))}: ${String(
            completion.value.get('message'),
          )}`
        : `: ${String(completion.value)}`;
    throw new Error(
      `Expected normal completion, got ${completion.type}${detail}`,
    );
  }

  return completion.value;
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
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {EngineObject} iterator
 * @param {() => void} [onEnumerate]
 * @returns {EngineObject}
 */
function createEnumeratingTarget(realm, iterator, onEnumerate = () => {}) {
  class EnumeratingTarget extends EngineObject {
    enumerate() {
      onEnumerate();
      return iterator;
    }
  }

  return new EnumeratingTarget(realm.intrinsics.objectPrototype);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {readonly unknown[]} values
 * @param {{
 *   returnBehavior?: 'object' | 'getter-throw' | 'call-throw' | 'non-object',
 * }} [options]
 * @returns {{
 *   iterator: EngineObject,
 *   state: {
 *     index: number,
 *     nextCalls: number,
 *     returnGets: number,
 *     returnCalls: number,
 *     returnRealms: (import('../src/runtime/realm.js').Realm | null)[],
 *   },
 * }}
 */
function createForInIterator(realm, values, options = {}) {
  const state = {
    index: 0,
    nextCalls: 0,
    returnGets: 0,
    returnCalls: 0,
    returnRealms:
      /** @type {(import('../src/runtime/realm.js').Realm | null)[]} */ ([]),
  };
  const iterator = new EngineObject(realm.intrinsics.objectPrototype);
  iterator.defineOwnProperty('next', {
    value: realm.createNativeFunction({
      name: 'next',
      length: 0,
      call() {
        state.nextCalls += 1;
        if (state.index >= values.length) {
          return createIterResultObject(realm, undefined, true);
        }
        const value = values[state.index];
        state.index += 1;
        return createIterResultObject(realm, value, false);
      },
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  const returnBehavior = options.returnBehavior ?? 'object';
  if (returnBehavior === 'getter-throw') {
    iterator.defineOwnProperty('return', {
      get: realm.createNativeFunction({
        name: 'get return',
        length: 0,
        call() {
          state.returnGets += 1;
          state.returnRealms.push(realm.agent.activeExecutionRealm);
          throw new GuestErrorSignal('TypeError', 'return getter');
        },
      }),
      enumerable: false,
      configurable: true,
    });
  } else {
    iterator.defineOwnProperty('return', {
      value: realm.createNativeFunction({
        name: 'return',
        length: 0,
        call() {
          state.returnCalls += 1;
          state.returnRealms.push(realm.agent.activeExecutionRealm);
          if (returnBehavior === 'call-throw') {
            throw new GuestErrorSignal('TypeError', 'return call');
          }
          if (returnBehavior === 'non-object') {
            return 1;
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
 * @param {import('../src/runtime/realm.js').Realm} evaluatingRealm
 * @param {import('../src/runtime/realm.js').Realm} boundaryRealm
 * @param {'object' | 'getter-throw' | 'call-throw' | 'non-object'} returnBehavior
 */
function createDelegatedForInSource(
  evaluatingRealm,
  boundaryRealm,
  returnBehavior,
) {
  const { iterator, state } = createForInIterator(boundaryRealm, ['tail'], {
    returnBehavior,
  });
  const boundary = new HostileExotic(
    boundaryRealm.intrinsics.objectPrototype,
    iterator,
  );
  const source = new EngineObject(evaluatingRealm.intrinsics.objectPrototype);
  source.defineOwnProperty('own', {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  if (!source.setPrototypeOf(boundary)) {
    throw new Error('Expected delegated for-in prototype installation');
  }
  return { boundary, source, state };
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'blocks declarations and if branches resume in their retained lexical context',
    run() {
      assertSame(
        run(`
          var outer = 'outer';
          function* g() {
            yield 'entry';
            {
              let outer = yield 'binding';
              if (yield 'test') {
                yield 'then:' + outer;
              } else {
                yield 'else:' + outer;
              }
            }
            return outer;
          }

          var yes = g();
          var yesEntry = yes.next();
          var yesBinding = yes.next();
          var yesTest = yes.next('inner');
          var yesBranch = yes.next(true);
          var yesResult = yes.next();

          var no = g();
          var noEntry = no.next();
          var noBinding = no.next();
          var noTest = no.next('other');
          var noBranch = no.next(false);
          var noResult = no.next();

          [
            yesEntry.value,
            yesBinding.value,
            yesTest.value,
            yesBranch.value,
            yesResult.value,
            yesResult.done,
            noEntry.value,
            noBinding.value,
            noTest.value,
            noBranch.value,
            noResult.value,
            noResult.done
          ].join('|');
        `),
        'entry|binding|test|then:inner|outer|true|' +
          'entry|binding|test|else:other|outer|true',
      );
    },
  },
  {
    name: 'while do-while and ordinary for retain each phase without repeated evaluation',
    run() {
      assertSame(
        run(`
          var log = [];
          function mark(label) {
            log.push(label);
            return label;
          }
          function* g() {
            var i = 0;
            while (((yield mark('while-test:' + i)), i < 2)) {
              yield mark('while-body:' + i);
              i = i + 1;
            }

            var d = 0;
            do {
              yield mark('do-body:' + d);
              d = d + 1;
            } while (((yield mark('do-test:' + d)), d < 2));

            var f = 0;
            for (
              yield mark('for-init');
              ((yield mark('for-test:' + f)), f < 2);
              ((yield mark('for-update:' + f)), f = f + 1)
            ) {
              yield mark('for-body:' + f);
            }
            return log.join(',');
          }

          var iterator = g();
          var yielded = [];
          var step = iterator.next();
          while (!step.done) {
            yielded.push(step.value);
            step = iterator.next();
          }
          yielded.join(',') + '|' + step.value;
        `),
        'while-test:0,while-body:0,while-test:1,while-body:1,while-test:2,' +
          'do-body:0,do-test:1,do-body:1,do-test:2,' +
          'for-init,for-test:0,for-body:0,for-update:0,' +
          'for-test:1,for-body:1,for-update:1,for-test:2|' +
          'while-test:0,while-body:0,while-test:1,while-body:1,while-test:2,' +
          'do-body:0,do-test:1,do-body:1,do-test:2,' +
          'for-init,for-test:0,for-body:0,for-update:0,' +
          'for-test:1,for-body:1,for-update:1,for-test:2',
      );
    },
  },
  {
    name: 'lexical for creates per-iteration environments across every suspension',
    run() {
      assertSame(
        run(`
          function* g() {
            var closures = [];
            for (
              let i = yield 'init';
              ((yield 'test:' + i), i < 3);
              ((yield 'update:' + i), i = i + 1)
            ) {
              closures.push(function () { return i; });
              yield 'body:' + i;
            }
            return [
              closures[0](),
              closures[1](),
              closures[2]()
            ].join(',');
          }

          var iterator = g();
          var yielded = [];
          var step = iterator.next();
          yielded.push(step.value);
          step = iterator.next(0);
          while (!step.done) {
            yielded.push(step.value);
            step = iterator.next();
          }
          yielded.join(',') + '|' + step.value;
        `),
        'init,test:0,body:0,update:0,test:1,body:1,update:1,' +
          'test:2,body:2,update:2,test:3|0,1,2',
      );
    },
  },
  {
    name: 'for-in resumes its right target and body and preserves lexical captures',
    run() {
      assertSame(
        run(`
          var source = { a: 1, b: 2 };
          function* targets() {
            var holder = {};
            var order = [];
            for (holder[yield 'target'] in (yield 'right')) {
              var current =
                order.length === 0 ? holder.first : holder.second;
              order.push(current);
              yield 'body:' + current;
            }
            return holder.first + ',' + holder.second + '|' + order.join(',');
          }

          var iterator = targets();
          var right = iterator.next();
          var firstTarget = iterator.next(source);
          var firstBody = iterator.next('first');
          var secondTarget = iterator.next();
          var secondBody = iterator.next('second');
          var targetResult = iterator.next();

          function* lexical() {
            var closures = [];
            for (let key in { left: 1, right: 2 }) {
              closures.push(function () { return key; });
              yield 'lexical:' + key;
            }
            return closures[0]() + ',' + closures[1]();
          }
          var lexicalIterator = lexical();
          var lexicalFirst = lexicalIterator.next();
          var lexicalSecond = lexicalIterator.next();
          var lexicalResult = lexicalIterator.next();

          [
            right.value,
            firstTarget.value,
            firstBody.value,
            secondTarget.value,
            secondBody.value,
            targetResult.value,
            lexicalFirst.value,
            lexicalSecond.value,
            lexicalResult.value
          ].join('|');
        `),
        'right|target|body:a|target|body:b|a,b|a,b|' +
          'lexical:left|lexical:right|left,right',
      );
    },
  },
  {
    name: 'generator for-in consumes arbitrary Enumerate iterators through public iterator operations',
    run() {
      /** @type {{ label: string, message: string, createIterator: (realm: import('../src/runtime/realm.js').Realm) => EngineObject }[]} */
      const cases = [
        {
          label: 'next getter',
          message: 'next getter',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              get: realm.createNativeFunction({
                name: 'get next',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'next getter');
                },
              }),
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'non-callable next',
          message: 'Enumerate iterator next is not callable',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: 1,
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'next call',
          message: 'next call',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'next call');
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'non-object result',
          message: 'Iterator result is not an object',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return 1;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'done getter',
          message: 'done getter',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            const result = new EngineObject(realm.intrinsics.objectPrototype);
            result.defineOwnProperty('done', {
              get: realm.createNativeFunction({
                name: 'get done',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'done getter');
                },
              }),
              enumerable: true,
              configurable: true,
            });
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return result;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'value getter',
          message: 'value getter',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            const result = createIterResultObject(realm, undefined, false);
            result.defineOwnProperty('value', {
              get: realm.createNativeFunction({
                name: 'get value',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'value getter');
                },
              }),
              enumerable: true,
              configurable: true,
            });
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return result;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'symbol value',
          message: 'Enumerate iterator value is not a string',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return createIterResultObject(realm, Symbol('key'), false);
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
      ];

      for (const entry of cases) {
        const realm = createRealm();
        let enumerateCalls = 0;
        const target = createEnumeratingTarget(
          realm,
          entry.createIterator(realm),
          () => {
            enumerateCalls += 1;
          },
        );
        defineGlobal(realm, 'source', target);

        const completion = evaluateScript(
          realm,
          'function* values() { for (var key in source) { yield key; } } ' +
            'var message; try { values().next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } message;',
        );
        assertSame(
          completion.type,
          'normal',
          `${entry.label} must be catchable from generator next`,
        );
        assertSame(completion.value, entry.message);
        assertSame(enumerateCalls, 1);
      }
    },
  },
  {
    name: 'generator for-in closes delivered Enumerate values on abrupt exits',
    run() {
      /** @type {string[]} */
      const failures = [];
      /**
       * @param {string} label
       * @param {unknown} actual
       * @param {unknown} expected
       */
      function expect(label, actual, expected) {
        if (!Object.is(actual, expected)) {
          failures.push(
            `${label}: expected ${String(expected)}, received ${String(actual)}`,
          );
        }
      }

      const cases = [
        {
          label: 'break',
          source:
            'function* loop() { for (var key in source) { break; yield key; } return "break"; } ' +
            'var step = loop().next(); step.value + "|" + step.done;',
          returnBehavior: 'object',
          output: 'break|true',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'return',
          source:
            'function* loop() { for (var key in source) { return "returned"; yield key; } } ' +
            'var step = loop().next(); step.value + "|" + step.done;',
          returnBehavior: 'object',
          output: 'returned|true',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'throw precedence',
          source:
            'function* loop() { for (var key in source) { throw new Error("body"); yield key; } } ' +
            'var message; try { loop().next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } message;',
          returnBehavior: 'call-throw',
          output: 'body',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'return getter',
          source:
            'function* loop() { for (var key in source) { break; yield key; } } ' +
            'var message; try { loop().next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } message;',
          returnBehavior: 'getter-throw',
          output: 'return getter',
          returnCalls: 0,
          returnGets: 1,
        },
        {
          label: 'return call',
          source:
            'function* loop() { for (var key in source) { break; yield key; } } ' +
            'var message; try { loop().next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } message;',
          returnBehavior: 'call-throw',
          output: 'return call',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'non-object return',
          source:
            'function* loop() { for (var key in source) { break; yield key; } } ' +
            'var message; try { loop().next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } message;',
          returnBehavior: 'non-object',
          output: 'Iterator return method returned a non-object value',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'target failure',
          source:
            'function* loop() { var target = null; for (target.key in source) { yield key; } } ' +
            'var message; try { loop().next(); message = "normal"; } ' +
            'catch (error) { message = error.name; } message;',
          returnBehavior: 'call-throw',
          output: 'TypeError',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'outer break',
          source:
            'function* loop() { outer: { for (var key in source) { break outer; yield key; } } ' +
            'return "outer break"; } var step = loop().next(); step.value + "|" + step.done;',
          returnBehavior: 'object',
          output: 'outer break|true',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'outer continue',
          source:
            'function* loop() { var count = 0; outer: while (count < 1) { count += 1; ' +
            'for (var key in source) { continue outer; yield key; } } return count; } ' +
            'var step = loop().next(); step.value + "|" + step.done;',
          returnBehavior: 'object',
          output: '1|true',
          returnCalls: 1,
          returnGets: 0,
        },
      ];

      for (const entry of cases) {
        const realm = createRealm();
        const { iterator, state } = createForInIterator(realm, ['key'], {
          returnBehavior:
            /** @type {'object' | 'getter-throw' | 'call-throw' | 'non-object'} */ (
              entry.returnBehavior
            ),
        });
        defineGlobal(realm, 'source', createEnumeratingTarget(realm, iterator));
        const completion = evaluateScript(realm, entry.source);
        expect(`${entry.label} completion`, completion.type, 'normal');
        expect(`${entry.label} value`, completion.value, entry.output);
        expect(
          `${entry.label} return calls`,
          state.returnCalls,
          entry.returnCalls,
        );
        expect(
          `${entry.label} return getter reads`,
          state.returnGets,
          entry.returnGets,
        );
      }

      const continueRealm = createRealm();
      const continued = createForInIterator(continueRealm, ['key']);
      defineGlobal(
        continueRealm,
        'source',
        createEnumeratingTarget(continueRealm, continued.iterator),
      );
      const continuedCompletion = evaluateScript(
        continueRealm,
        'function* loop() { for (var key in source) { continue; yield key; } ' +
          'return "exhausted"; } var step = loop().next(); step.value + "|" + step.done;',
      );
      expect('owned continue completion', continuedCompletion.type, 'normal');
      expect(
        'owned continue value',
        continuedCompletion.value,
        'exhausted|true',
      );
      expect('owned continue return calls', continued.state.returnCalls, 0);
      expect('owned continue next calls', continued.state.nextCalls, 2);
      assertSame(failures.join('\n'), '');
    },
  },
  {
    name: 'generator for-in closes a hostile prototype remainder on every early exit',
    run() {
      const cases = [
        {
          label: 'break',
          source:
            'function* loop() { for (var key in source) { break; yield key; } return "break"; } ' +
            'var step = loop().next(); step.value + "|" + step.done;',
          returnBehavior: 'object',
          value: 'break|true',
        },
        {
          label: 'return',
          source:
            'function* loop() { for (var key in source) { return "returned"; yield key; } } ' +
            'var step = loop().next(); step.value + "|" + step.done;',
          returnBehavior: 'object',
          value: 'returned|true',
        },
        {
          label: 'throw precedence',
          source:
            'function* loop() { for (var key in source) { throw new Error("body"); yield key; } } ' +
            'var message; try { loop().next(); } catch (error) { message = error.message; } message;',
          returnBehavior: 'call-throw',
          value: 'body',
        },
        {
          label: 'abrupt close',
          source:
            'function* loop() { for (var key in source) { break; yield key; } } ' +
            'var message; try { loop().next(); } catch (error) { message = error.message; } message;',
          returnBehavior: 'call-throw',
          value: 'return call',
        },
      ];

      for (const entry of cases) {
        const evaluatingRealm = createRealm({ agent: createAgent() });
        const boundaryRealm = createRealm({ agent: createAgent() });
        const { boundary, source, state } = createDelegatedForInSource(
          evaluatingRealm,
          boundaryRealm,
          /** @type {'object' | 'call-throw'} */ (entry.returnBehavior),
        );
        defineGlobal(evaluatingRealm, 'source', source);

        const completion = evaluateScript(evaluatingRealm, entry.source);
        assertSame(completion.type, 'normal', entry.label);
        assertSame(completion.value, entry.value, entry.label);
        assertSame(state.nextCalls, 0, entry.label);
        assertSame(state.returnCalls, 1, entry.label);
        assertSame(state.returnGets, 0, entry.label);
        assertSame(state.returnRealms.length, 1, entry.label);
        assertSame(state.returnRealms[0], boundaryRealm, entry.label);
        assertSame(
          JSON.stringify(boundary.calls),
          '[["enumerate"]]',
          entry.label,
        );
        assertSame(
          evaluatingRealm.agent.activeExecutionRealm,
          null,
          entry.label,
        );
        assertSame(boundaryRealm.agent.activeExecutionRealm, null, entry.label);
        assertSame(
          evaluatingRealm.agent._synchronousCallChain,
          null,
          entry.label,
        );
        assertSame(
          boundaryRealm.agent._synchronousCallChain,
          null,
          entry.label,
        );
        assertSame(
          evaluatingRealm.agent._generatorHostChain,
          null,
          entry.label,
        );
        assertSame(boundaryRealm.agent._generatorHostChain, null, entry.label);
      }
    },
  },
  {
    name: 'generator for-in leaves IteratorStep and IteratorValue failures unclosed',
    run() {
      /** @type {{
       *   label: string,
       *   install: (
       *     realm: import('../src/runtime/realm.js').Realm,
       *     iterator: EngineObject,
       *   ) => void,
       *   message: string,
       * }[]} */
      const cases = [
        {
          label: 'step',
          install(realm, iterator) {
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'next failure');
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
          },
          message: 'next failure',
        },
        {
          label: 'value',
          install(realm, iterator) {
            const result = createIterResultObject(realm, 'key', false);
            result.defineOwnProperty('value', {
              get: realm.createNativeFunction({
                name: 'get value',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'value failure');
                },
              }),
              enumerable: true,
              configurable: true,
            });
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return result;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
          },
          message: 'value failure',
        },
      ];

      for (const entry of cases) {
        const realm = createRealm();
        const { iterator, state } = createForInIterator(realm, ['key']);
        entry.install(realm, iterator);
        defineGlobal(realm, 'source', createEnumeratingTarget(realm, iterator));
        const completion = evaluateScript(
          realm,
          'function* loop() { for (var key in source) { yield key; } } ' +
            'var message; try { loop().next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } message;',
        );
        assertSame(completion.type, 'normal', entry.label);
        assertSame(completion.value, entry.message, entry.label);
        assertSame(state.returnCalls, 0, entry.label);
        assertSame(state.returnGets, 0, entry.label);
      }
    },
  },
  {
    name: 'generator for-in stops live rechecks at a dispatched exotic remainder',
    run() {
      const realm = createRealm();
      const remainder = createForInIterator(realm, []);
      let enumerateCalls = 0;
      let boundaryGets = 0;
      class EnumerateBoundary extends EngineObject {
        enumerate() {
          enumerateCalls += 1;
          return remainder.iterator;
        }

        /**
         * @param {import('../src/runtime/descriptors.js').PropertyKey} key
         */
        getOwnProperty(key) {
          if (key === 'duplicate') {
            boundaryGets += 1;
            throw new Error('live lookup crossed Enumerate boundary');
          }
          return super.getOwnProperty(key);
        }
      }

      const boundary = new EnumerateBoundary(realm.intrinsics.objectPrototype);
      const source = new EngineObject(boundary);
      source.defineOwnProperty('first', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      source.defineOwnProperty('duplicate', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(realm, 'source', source);

      const completion = evaluateScript(
        realm,
        'function* values() { var keys = []; for (var key in source) { ' +
          'keys.push(key); delete source.duplicate; yield key; } return keys.join(","); } ' +
          'var iterator = values(); var first = iterator.next(); var done = iterator.next(); ' +
          '[first.value, done.value, done.done].join("|");',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'first|first|true');
      assertSame(enumerateCalls, 1);
      assertSame(boundaryGets, 0);
    },
  },
  {
    name: 'generator for-in rejects non-string exotic remainder values after an ordinary prefix',
    run() {
      for (const value of [Symbol('remainder'), 1]) {
        const realm = createRealm();
        const remainder = createForInIterator(realm, [value]);
        let enumerateCalls = 0;
        class EnumerateBoundary extends EngineObject {
          enumerate() {
            enumerateCalls += 1;
            return remainder.iterator;
          }
        }

        const boundary = new EnumerateBoundary(
          realm.intrinsics.objectPrototype,
        );
        const source = new EngineObject(boundary);
        source.defineOwnProperty('prefix', {
          value: 1,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        defineGlobal(realm, 'source', source);

        const completion = evaluateScript(
          realm,
          'function* values() { for (var key in source) { yield key; } } ' +
            'var iterator = values(); var first = iterator.next(); var message; ' +
            'try { iterator.next(); message = "normal"; } ' +
            'catch (error) { message = error.message; } first.value + "|" + message;',
        );
        assertSame(completion.type, 'normal');
        assertSame(
          completion.value,
          'prefix|Enumerate iterator value is not a string',
        );
        assertSame(enumerateCalls, 1);
        assertSame(remainder.state.nextCalls, 1);
      }
    },
  },
  {
    name: 'generator for-in bridges a separate target Agent into its evaluating Realm',
    run() {
      const evaluatingAgent = createAgent();
      const targetAgent = createAgent();
      const evaluatingRealm = createRealm({ agent: evaluatingAgent });
      const targetRealm = createRealm({ agent: targetAgent });
      let enumerateCalls = 0;
      /** @type {{ iterator: EngineObject | null }} */
      const captured = { iterator: null };

      class CapturingTarget extends EngineObject {
        enumerate() {
          assertSame(
            targetAgent.activeExecutionRealm,
            evaluatingRealm,
            'separate target Agent must see the evaluating Realm',
          );
          enumerateCalls += 1;
          const iterator = super.enumerate();
          captured.iterator = iterator;
          return iterator;
        }
      }

      const source = new CapturingTarget(
        targetRealm.intrinsics.objectPrototype,
      );
      source.defineOwnProperty('key', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(evaluatingRealm, 'source', source);

      assertSame(
        evaluateScript(
          evaluatingRealm,
          'function* values() { for (var key in source) { yield key; } } ' +
            'var valuesIterator = values(); ' +
            'var first = valuesIterator.next(); var done = valuesIterator.next(); ' +
            '[first.value, first.done, done.done].join("|");',
        ).value,
        'key|false|true',
      );
      assertSame(enumerateCalls, 1);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
      const iterator = captured.iterator;
      if (iterator === null) {
        throw new Error('Expected for-in to retain its iterator');
      }
      assertSame(
        iterator.getPrototypeOf(),
        evaluatingRealm.intrinsics.iteratorPrototype,
      );
      const iteratorMethod = /** @type {any} */ (
        iterator.get(
          evaluatingAgent.wellKnownSymbols.iterator,
          iterator,
          evaluatingRealm,
        )
      );
      assertSame(iteratorMethod.realm, evaluatingRealm);
      assertSame(
        callCallable(iteratorMethod, iterator, [], evaluatingRealm),
        iterator,
      );
      const next = /** @type {any} */ (iterator.get('next', iterator));
      assertSame(next.realm, evaluatingRealm);
      const result = /** @type {EngineObject} */ (
        next.callFunction(iterator, [], evaluatingRealm)
      );
      assertSame(
        result.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );

      class AbruptTarget extends EngineObject {
        /** @returns {EngineObject} */
        enumerate() {
          assertSame(
            targetAgent.activeExecutionRealm,
            evaluatingRealm,
            'abrupt dispatch must still install the evaluating Realm',
          );
          throw new GuestErrorSignal('TypeError', 'enumerate abrupt');
        }
      }

      defineGlobal(
        evaluatingRealm,
        'abruptSource',
        new AbruptTarget(targetRealm.intrinsics.objectPrototype),
      );
      const abrupt = evaluateScript(
        evaluatingRealm,
        'function* values() { for (var key in abruptSource) { yield key; } } ' +
          'var message; try { values().next(); message = "normal"; } ' +
          'catch (error) { message = error.message; } message;',
      );
      assertSame(abrupt.type, 'normal');
      assertSame(abrupt.value, 'enumerate abrupt');
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
    },
  },
  {
    name: 'generator for-in bridges a separately owned ordinary Enumerate boundary into its evaluating Realm',
    run() {
      const evaluatingAgent = createAgent();
      const targetAgent = createAgent();
      const boundaryAgent = createAgent();
      const evaluatingRealm = createRealm({ agent: evaluatingAgent });
      const targetRealm = createRealm({ agent: targetAgent });
      const boundaryRealm = createRealm({ agent: boundaryAgent });
      let enumerateCalls = 0;
      /** @type {{ iterator: EngineObject | null }} */
      const captured = { iterator: null };

      class DelegatingBoundary extends EngineObject {
        enumerate() {
          assertSame(
            boundaryAgent.activeExecutionRealm,
            evaluatingRealm,
            'separate boundary Agent must see the evaluating Realm',
          );
          enumerateCalls += 1;
          const iterator = super.enumerate();
          captured.iterator = iterator;
          return iterator;
        }
      }

      const boundary = new DelegatingBoundary(
        boundaryRealm.intrinsics.objectPrototype,
      );
      boundary.defineOwnProperty('boundary', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const source = new EngineObject(targetRealm.intrinsics.objectPrototype);
      source.defineOwnProperty('target', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(source.agent, targetAgent);
      assertSame(boundary.agent, boundaryAgent);
      assertSame(source.setPrototypeOf(boundary), true);
      defineGlobal(evaluatingRealm, 'source', source);

      const normal = evaluateScript(
        evaluatingRealm,
        'function* values() { var keys = []; for (var key in source) { ' +
          'keys.push(key); yield key; } return keys.join(","); } ' +
          'var valuesIterator = values(); var first = valuesIterator.next(); ' +
          'var second = valuesIterator.next(); var done = valuesIterator.next(); ' +
          '[first.value, second.value, done.value, done.done].join("|");',
      );
      assertSame(normal.type, 'normal');
      assertSame(normal.value, 'target|boundary|target,boundary|true');
      assertSame(enumerateCalls, 1);
      assertSame(evaluatingAgent.activeExecutionRealm, null);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(boundaryAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._synchronousCallChain, null);
      assertSame(targetAgent._synchronousCallChain, null);
      assertSame(boundaryAgent._synchronousCallChain, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
      assertSame(boundaryAgent._generatorHostChain, null);

      const iterator = captured.iterator;
      if (iterator === null) {
        throw new Error('Expected boundary Enumerate to retain its iterator');
      }
      assertSame(
        iterator.getPrototypeOf(),
        evaluatingRealm.intrinsics.iteratorPrototype,
      );
      const next = /** @type {any} */ (iterator.get('next', iterator));
      assertSame(next.realm, evaluatingRealm);
      const result = /** @type {EngineObject} */ (
        next.callFunction(iterator, [], evaluatingRealm)
      );
      assertSame(
        result.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );

      let abruptEnumerateCalls = 0;
      /** @type {{ iterator: EngineObject | null }} */
      const abruptCaptured = { iterator: null };
      class AbruptDelegatingBoundary extends EngineObject {
        /** @returns {EngineObject} */
        enumerate() {
          assertSame(
            boundaryAgent.activeExecutionRealm,
            evaluatingRealm,
            'abrupt boundary dispatch must see the evaluating Realm',
          );
          abruptEnumerateCalls += 1;
          const iterator = super.enumerate();
          abruptCaptured.iterator = iterator;
          throw new GuestErrorSignal('TypeError', 'boundary enumerate abrupt');
        }
      }

      const abruptBoundary = new AbruptDelegatingBoundary(
        boundaryRealm.intrinsics.objectPrototype,
      );
      const abruptSource = new EngineObject(
        targetRealm.intrinsics.objectPrototype,
      );
      assertSame(abruptSource.setPrototypeOf(abruptBoundary), true);
      defineGlobal(evaluatingRealm, 'abruptSource', abruptSource);

      const abrupt = evaluateScript(
        evaluatingRealm,
        'function* values() { for (var key in abruptSource) { yield key; } } ' +
          'var message; try { values().next(); message = "normal"; } ' +
          'catch (error) { message = error.message; } message;',
      );
      assertSame(abrupt.type, 'normal');
      assertSame(abrupt.value, 'boundary enumerate abrupt');
      assertSame(abruptEnumerateCalls, 1);
      assertSame(evaluatingAgent.activeExecutionRealm, null);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(boundaryAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._synchronousCallChain, null);
      assertSame(targetAgent._synchronousCallChain, null);
      assertSame(boundaryAgent._synchronousCallChain, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
      assertSame(boundaryAgent._generatorHostChain, null);

      const abruptIterator = abruptCaptured.iterator;
      if (abruptIterator === null) {
        throw new Error(
          'Expected abrupt boundary Enumerate to allocate an iterator',
        );
      }
      assertSame(
        abruptIterator.getPrototypeOf(),
        evaluatingRealm.intrinsics.iteratorPrototype,
      );
      const abruptNext = /** @type {any} */ (
        abruptIterator.get('next', abruptIterator)
      );
      assertSame(abruptNext.realm, evaluatingRealm);
      const abruptResult = /** @type {EngineObject} */ (
        abruptNext.callFunction(abruptIterator, [], evaluatingRealm)
      );
      assertSame(
        abruptResult.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );
    },
  },
  {
    name: 'generator for-in retains mutation, nullish, and lexical-head behavior',
    run() {
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'function* values() { var object = { first: 1, removed: 2 }; var keys = []; ' +
            'for (var key in object) { keys.push(key); delete object.removed; yield key; } ' +
            'return keys.join(","); } var iterator = values(); var first = iterator.next(); ' +
            'var done = iterator.next(); [first.value, done.value, done.done].join("|");',
        ).value,
        'first|first|true',
      );
      assertSame(
        evaluateScript(
          realm,
          'function* values() { var object = { first: 1, hidden: 2 }; var keys = []; ' +
            'for (var key in object) { keys.push(key); ' +
            'Object.defineProperty(object, "hidden", { enumerable: false }); yield key; } ' +
            'return keys.join(","); } var iterator = values(); var first = iterator.next(); ' +
            'var done = iterator.next(); [first.value, done.value, done.done].join("|");',
        ).value,
        'first|first|true',
      );
      assertSame(
        evaluateScript(
          realm,
          'function* values() { var object = { first: 1 }; var keys = []; ' +
            'for (var key in object) { keys.push(key); object.added = 2; yield key; } ' +
            'return keys.join(","); } var iterator = values(); var first = iterator.next(); ' +
            'var done = iterator.next(); [first.value, done.value, done.done].join("|");',
        ).value,
        'first|first|true',
      );
      assertSame(
        evaluateScript(
          realm,
          'function Initial() {} function Replacement() {} Initial.prototype.old = 1; ' +
            'Replacement.prototype.newKey = 1; var object = new Initial(); object.first = 1; ' +
            'function* values() { var keys = []; for (var key in object) { keys.push(key); ' +
            'if (key === "first") { Object.setPrototypeOf(object, Replacement.prototype); } ' +
            'yield key; } return keys.join(","); } var iterator = values(); ' +
            'var first = iterator.next(); var done = iterator.next(); ' +
            '[first.value, done.value, done.done].join("|");',
        ).value,
        'first|first|true',
      );
      assertSame(
        evaluateScript(
          realm,
          'function* nullValues() { for (var key in null) { yield key; } } ' +
            'function* undefinedValues() { for (var key in undefined) { yield key; } } ' +
            '[nullValues().next().done, undefinedValues().next().done].join("|");',
        ).value,
        'true|true',
      );
      assertSame(
        evaluateScript(
          realm,
          'function* values() { for (let key in key) { yield key; } } ' +
            'var name; try { values().next(); name = "normal"; } ' +
            'catch (error) { name = error.name; } name;',
        ).value,
        'ReferenceError',
      );
    },
  },
  {
    name: 'generator for-in skips an inherited non-enumerable shadow after its own property is deleted',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'function Base() {} ' +
          'Object.defineProperty(Base.prototype, "hidden", ' +
          '{ value: "base", writable: true, enumerable: false, configurable: true }); ' +
          'var child = new Base(); child.first = 1; child.hidden = "own"; ' +
          'function* values() { var keys = []; for (var key in child) { ' +
          'keys.push(key); if (key === "first") { delete child.hidden; } ' +
          'yield key; } return keys.join(","); } ' +
          'var iterator = values(); var first = iterator.next(); var done = iterator.next(); ' +
          '[first.value, done.value, done.done].join("|");',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'first|first|true');
    },
  },
  {
    name: 'generator for-in yields index keys before string keys',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var object = { 2: "two", text: "text", 1: "one" }; ' +
          'function* values() { var keys = []; for (var key in object) { ' +
          'keys.push(key); yield key; } return keys.join(","); } ' +
          'var iterator = values(); var first = iterator.next(); ' +
          'var second = iterator.next(); var third = iterator.next(); ' +
          'var done = iterator.next(); ' +
          '[first.value, second.value, third.value, done.value, done.done].join("|");',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, '1|2|text|1,2,text|true');
    },
  },
  {
    name: 'for-of resumes its right target and body and preserves lexical captures',
    run() {
      assertSame(
        run(`
          var source = [10, 20];
          function* targets() {
            var holder = {};
            var order = [];
            for (holder[yield 'target'] of (yield 'right')) {
              var current =
                order.length === 0 ? holder.first : holder.second;
              order.push(current);
              yield 'body:' + current;
            }
            return holder.first + ',' + holder.second + '|' + order.join(',');
          }

          var iterator = targets();
          var right = iterator.next();
          var firstTarget = iterator.next(source);
          var firstBody = iterator.next('first');
          var secondTarget = iterator.next();
          var secondBody = iterator.next('second');
          var targetResult = iterator.next();

          function* lexical() {
            var closures = [];
            for (let value of [3, 4]) {
              closures.push(function () { return value; });
              yield 'lexical:' + value;
            }
            return closures[0]() + ',' + closures[1]();
          }
          var lexicalIterator = lexical();
          var lexicalFirst = lexicalIterator.next();
          var lexicalSecond = lexicalIterator.next();
          var lexicalResult = lexicalIterator.next();

          [
            right.value,
            firstTarget.value,
            firstBody.value,
            secondTarget.value,
            secondBody.value,
            targetResult.value,
            lexicalFirst.value,
            lexicalSecond.value,
            lexicalResult.value
          ].join('|');
        `),
        'right|target|body:10|target|body:20|10,20|10,20|' +
          'lexical:3|lexical:4|3,4',
      );
    },
  },
  {
    name: 'for-of closes abrupt consumers with exact throw precedence and not iterator faults',
    run() {
      assertSame(
        run(`
          function make(mode) {
            var log = { next: 0, close: 0 };
            var iterable = {};
            iterable[Symbol.iterator] = function () {
              var index = 0;
              var iterator = {};
              iterator.next = function () {
                log.next = log.next + 1;
                if (mode === 'next-throw') {
                  throw 'next-error';
                }
                if (mode === 'value-throw') {
                  var broken = { done: false };
                  Object.defineProperty(broken, 'value', {
                    get: function () { throw 'value-error'; }
                  });
                  return broken;
                }
                if (index < 2) {
                  index = index + 1;
                  return { value: index, done: false };
                }
                return { done: true };
              };
              iterator['return'] = function () {
                log.close = log.close + 1;
                if (mode === 'return-throw') {
                  throw 'close-error';
                }
                return {};
              };
              return iterator;
            };
            return { iterable: iterable, log: log };
          }

          function* consume(iterable) {
            for (var value of iterable) {
              yield value;
            }
            return 'natural';
          }

          var normal = make('normal');
          var normalIterator = consume(normal.iterable);
          var normalPause = normalIterator.next();
          var normalReturn = normalIterator.return(42);

          var throwingClose = make('return-throw');
          var throwIterator = consume(throwingClose.iterable);
          throwIterator.next();
          var original = {};
          var originalWon = false;
          try {
            throwIterator.throw(original);
          } catch (error) {
            originalWon = error === original;
          }

          var replacingClose = make('return-throw');
          var returnIterator = consume(replacingClose.iterable);
          returnIterator.next();
          var closeWon = false;
          try {
            returnIterator.return(9);
          } catch (error) {
            closeWon = error === 'close-error';
          }

          var nextFault = make('next-throw');
          var nextFaultCaught = false;
          try {
            consume(nextFault.iterable).next();
          } catch (error) {
            nextFaultCaught = error === 'next-error';
          }

          var valueFault = make('value-throw');
          var valueFaultCaught = false;
          try {
            consume(valueFault.iterable).next();
          } catch (error) {
            valueFaultCaught = error === 'value-error';
          }

          [
            normalPause.value,
            normal.log.close,
            normalReturn.value,
            normalReturn.done,
            throwingClose.log.close,
            originalWon,
            replacingClose.log.close,
            closeWon,
            nextFault.log.close,
            nextFaultCaught,
            valueFault.log.close,
            valueFaultCaught
          ].join(':');
        `),
        '1:1:42:true:1:true:1:true:0:true:0:true',
      );
    },
  },
  {
    name: 'switch resumes discriminants tests and fallthrough without re-evaluation',
    run() {
      assertSame(
        run(`
          var log = [];
          function mark(label) {
            log.push(label);
            return label;
          }
          function* g() {
            switch (yield mark('discriminant')) {
              case (yield mark('case-a')):
                yield mark('body-a');
              case (yield mark('case-b')):
                yield mark('body-b');
                break;
              default:
                yield mark('body-default');
              case (yield mark('case-c')):
                yield mark('body-c');
            }
            return log.join(',');
          }

          var first = g();
          first.next();
          first.next('a');
          first.next('a');
          first.next();
          var firstResult = first.next();

          log = [];
          var second = g();
          second.next();
          second.next('b');
          second.next('a');
          second.next('b');
          var secondResult = second.next();

          log = [];
          var third = g();
          third.next();
          third.next('c');
          third.next('a');
          third.next('b');
          third.next('c');
          var thirdResult = third.next();

          log = [];
          var fallback = g();
          fallback.next();
          fallback.next('none');
          fallback.next('a');
          fallback.next('b');
          fallback.next('c');
          fallback.next();
          var fallbackResult = fallback.next();

          [
            firstResult.value,
            secondResult.value,
            thirdResult.value,
            fallbackResult.value
          ].join('|');
        `),
        'discriminant,case-a,body-a,body-b|' +
          'discriminant,case-a,case-b,body-b|' +
          'discriminant,case-a,case-b,case-c,body-c|' +
          'discriminant,case-a,case-b,case-c,body-default,body-c',
      );
    },
  },
  {
    name: 'labels route owned and propagated break and continue across suspended loops',
    run() {
      assertSame(
        run(`
          function* g() {
            block: {
              yield 'block';
              break block;
              yield 'wrong-block';
            }

            for (var k = 0; k < 2; k = k + 1) {
              yield 'plain-break';
              break;
            }

            outer: for (var i = 0; i < 3; i = i + 1) {
              for (var j = 0; j < 3; j = j + 1) {
                yield i + ':' + j;
                if (j === 0) {
                  continue;
                }
                if (i === 0) {
                  continue outer;
                }
                break outer;
              }
            }
            return 'done';
          }

          var iterator = g();
          var yielded = [];
          var step = iterator.next();
          while (!step.done) {
            yielded.push(step.value);
            step = iterator.next();
          }
          yielded.join(',') + '|' + step.value;
        `),
        'block,plain-break,0:0,0:1,1:0,1:1|done',
      );
    },
  },
  {
    name: 'with resumes its object and body while retaining only the derived environment',
    run() {
      assertSame(
        run(`
          var object = {
            value: 7,
            method: function () { return this === object; }
          };
          function* g() {
            var receiver;
            with (yield 'object') {
              yield 'body:' + value;
              receiver = method();
            }
            return receiver + ':' + typeof value;
          }

          var iterator = g();
          var objectStep = iterator.next();
          var bodyStep = iterator.next(object);
          var result = iterator.next();
          [
            objectStep.value,
            bodyStep.value,
            result.value,
            result.done
          ].join('|');
        `),
        'object|body:7|true:undefined|true',
      );
    },
  },
  {
    name: 'injected throw enters catch while return bypasses catch and both run yielding finally',
    run() {
      assertSame(
        run(`
          function* g() {
            try {
              yield 'try';
            } catch (error) {
              yield 'catch:' + error;
            } finally {
              yield 'finally';
            }
            return 'done';
          }

          var normal = g();
          var normalTry = normal.next();
          var normalFinally = normal.next();
          var normalResult = normal.next();

          var thrown = g();
          var thrownTry = thrown.next();
          var thrownCatch = thrown.throw('boom');
          var thrownFinally = thrown.next();
          var thrownResult = thrown.next();

          var returned = g();
          var returnedTry = returned.next();
          var returnedFinally = returned.return('returned');
          var returnedResult = returned.next();

          [
            normalTry.value,
            normalFinally.value,
            normalResult.value,
            normalResult.done,
            thrownTry.value,
            thrownCatch.value,
            thrownFinally.value,
            thrownResult.value,
            thrownResult.done,
            returnedTry.value,
            returnedFinally.value,
            returnedFinally.done,
            returnedResult.value,
            returnedResult.done
          ].join('|');
        `),
        'try|finally|done|true|' +
          'try|catch:boom|finally|done|true|' +
          'try|finally|false|returned|true',
      );
    },
  },
  {
    name: 'throw and return injected inside catch unwind through a yielding finally',
    run() {
      assertSame(
        run(`
          function* g() {
            try {
              yield 'try';
            } catch (error) {
              yield 'catch:' + error;
              yield 'catch-after';
            } finally {
              yield 'finally';
            }
            return 'done';
          }

          var throwing = g();
          throwing.next();
          var throwingCatch = throwing.throw('first');
          var throwingFinally = throwing.throw('second');
          var secondWon = false;
          try {
            throwing.next();
          } catch (error) {
            secondWon = error === 'second';
          }

          var returning = g();
          returning.next();
          var returningCatch = returning.throw('first');
          var returningFinally = returning.return(17);
          var returningResult = returning.next();

          [
            throwingCatch.value,
            throwingFinally.value,
            secondWon,
            returningCatch.value,
            returningFinally.value,
            returningFinally.done,
            returningResult.value,
            returningResult.done
          ].join('|');
        `),
        'catch:first|finally|true|catch:first|finally|false|17|true',
      );
    },
  },
  {
    name: 'yielding finally restores pending abrupt completions unless its own abrupt replaces them',
    run() {
      assertSame(
        run(`
          function* preserveThrow() {
            try {
              yield 'try';
            } finally {
              yield 'finally';
            }
          }
          var original = {};
          var preserved = preserveThrow();
          preserved.next();
          var preservedFinally = preserved.throw(original);
          var preservedThrow = false;
          try {
            preserved.next();
          } catch (error) {
            preservedThrow = error === original;
          }

          function* replaceWithReturn() {
            try {
              yield 'try';
            } finally {
              yield 'finally';
              return 'replacement-return';
            }
          }
          var replacingReturn = replaceWithReturn();
          replacingReturn.next();
          var returnFinally = replacingReturn.return('pending-return');
          var returnResult = replacingReturn.next();

          function* replaceWithThrow() {
            try {
              yield 'try';
            } finally {
              yield 'finally';
              throw 'replacement-throw';
            }
          }
          var replacingThrow = replaceWithThrow();
          replacingThrow.next();
          var throwFinally = replacingThrow.return('pending-return');
          var replacementThrow = false;
          try {
            replacingThrow.next();
          } catch (error) {
            replacementThrow = error === 'replacement-throw';
          }

          function* pendingReturn() {
            try {
              return 'pending';
            } finally {
              yield 'finally';
              yield 'after-finally';
            }
          }
          var injectedThrow = pendingReturn();
          var injectedThrowFinally = injectedThrow.next();
          var injectedThrowWon = false;
          try {
            injectedThrow.throw('injected-throw');
          } catch (error) {
            injectedThrowWon = error === 'injected-throw';
          }

          var injectedReturn = pendingReturn();
          var injectedReturnFinally = injectedReturn.next();
          var injectedReturnResult = injectedReturn.return('injected-return');

          [
            preservedFinally.value,
            preservedThrow,
            returnFinally.value,
            returnResult.value,
            returnResult.done,
            throwFinally.value,
            replacementThrow,
            injectedThrowFinally.value,
            injectedThrowWon,
            injectedReturnFinally.value,
            injectedReturnResult.value,
            injectedReturnResult.done
          ].join('|');
        `),
        'finally|true|finally|replacement-return|true|' +
          'finally|true|finally|true|finally|injected-return|true',
      );
    },
  },
  {
    name: 'nested try catch finally retains each pending completion across suspension',
    run() {
      assertSame(
        run(`
          function* g() {
            try {
              try {
                yield 'inner-try';
              } finally {
                yield 'inner-finally';
              }
            } catch (error) {
              yield 'outer-catch:' + error;
            } finally {
              yield 'outer-finally';
            }
            return 'done';
          }

          var iterator = g();
          var inner = iterator.next();
          var innerFinally = iterator.throw('reason');
          var outerCatch = iterator.next();
          var outerFinally = iterator.next();
          var result = iterator.next();
          [
            inner.value,
            innerFinally.value,
            outerCatch.value,
            outerFinally.value,
            result.value,
            result.done
          ].join('|');
        `),
        'inner-try|inner-finally|outer-catch:reason|outer-finally|done|true',
      );
    },
  },
  {
    name: 'break continue and return unwind through yielding finally blocks',
    run() {
      assertSame(
        run(`
          function* loops() {
            for (var i = 0; i < 3; i = i + 1) {
              try {
                if (i === 0) {
                  continue;
                }
                break;
              } finally {
                yield 'finally:' + i;
              }
            }
            yield 'after-loop';
            return 'loop-done';
          }
          var loopIterator = loops();
          var continueFinally = loopIterator.next();
          var breakFinally = loopIterator.next();
          var afterLoop = loopIterator.next();
          var loopResult = loopIterator.next();

          function* returning() {
            try {
              return 'return-done';
            } finally {
              yield 'return-finally';
            }
          }
          var returnIterator = returning();
          var returnFinally = returnIterator.next();
          var returnResult = returnIterator.next();

          [
            continueFinally.value,
            breakFinally.value,
            afterLoop.value,
            loopResult.value,
            loopResult.done,
            returnFinally.value,
            returnResult.value,
            returnResult.done
          ].join('|');
        `),
        'finally:0|finally:1|after-loop|loop-done|true|' +
          'return-finally|return-done|true',
      );
    },
  },
  {
    name: 'guest reentrant next throw and return report TypeError without corrupting execution',
    run() {
      assertSame(
        run(`
          var iterator;
          var errors = [];
          function attempt(kind) {
            try {
              if (kind === 'next') {
                iterator.next();
              } else if (kind === 'throw') {
                iterator.throw('nested');
              } else {
                iterator.return('nested');
              }
              errors.push(kind + ':missing');
            } catch (error) {
              errors.push(kind + ':' + error.name);
            }
            return kind;
          }
          function* g() {
            yield attempt('next');
            yield attempt('throw');
            yield attempt('return');
            return errors.join(',');
          }

          iterator = g();
          var nextStep = iterator.next();
          var throwStep = iterator.next();
          var returnStep = iterator.next();
          var result = iterator.next();
          [
            nextStep.value,
            throwStep.value,
            returnStep.value,
            result.value,
            result.done
          ].join('|');
        `),
        'next|throw|return|' +
          'next:TypeError,throw:TypeError,return:TypeError|true',
      );
    },
  },
];

export default tests;
