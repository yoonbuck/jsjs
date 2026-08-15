import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function evaluateNormal(realm, source) {
  const completion = evaluateScript(realm, source);

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
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateNormal(createRealm(), source);
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'yield star forwards inner yields and supplies the final expression value',
    run() {
      assertSame(
        run(`
          function* inner() {
            yield 1;
            return 2;
          }
          function* outer() {
            var final = yield* inner();
            return final + 1;
          }

          var iterator = outer();
          var first = iterator.next();
          var result = iterator.next('ignored');
          [
            first.value,
            first.done,
            result.value,
            result.done
          ].join(':');
        `),
        '1:false:3:true',
      );
    },
  },
  {
    name: 'yield star captures next once, passes undefined initially, and forwards done-false results',
    run() {
      assertSame(
        run(`
          var log = [];
          var nextGets = 0;
          var calls = 0;
          var produced = [];
          var iterator = {};

          function result(label, value, done) {
            var object = {};
            Object.defineProperty(object, 'done', {
              get: function () {
                log.push(label + ':done');
                return done;
              }
            });
            Object.defineProperty(object, 'value', {
              get: function () {
                log.push(label + ':value');
                return value;
              }
            });
            produced.push(object);
            return object;
          }

          function capturedNext(value) {
            calls = calls + 1;
            log.push(
              'call' + calls + ':' + arguments.length + ':' + String(value)
            );
            if (calls === 1) {
              return result('first', 1, false);
            }
            if (calls === 2) {
              return result('second', 2, false);
            }
            return result('third', 5, true);
          }

          Object.defineProperty(iterator, 'next', {
            configurable: true,
            get: function () {
              nextGets = nextGets + 1;
              return capturedNext;
            }
          });
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          function* outer() {
            var final = yield* iterator;
            return final + 1;
          }

          var delegated = outer();
          var first = delegated.next('not-forwarded');
          Object.defineProperty(iterator, 'next', {
            configurable: true,
            value: function () {
              throw new Error('replacement next must not be observed');
            }
          });
          var second = delegated.next(undefined);
          var final = delegated.next(9);

          [
            first.value,
            first.done,
            second.value,
            second.done,
            final.value,
            final.done,
            nextGets,
            first === produced[0],
            second === produced[1],
            log.join(',')
          ].join('|');
        `),
        '1|false|2|false|6|true|1|true|true|' +
          'call1:1:undefined,first:done,' +
          'call2:1:undefined,second:done,' +
          'call3:1:9,third:done,third:value,' +
          'first:value,first:done,second:value,second:done',
      );
    },
  },
  {
    name: 'yield star preserves a foreign done-false result and uses the executing Realm on completion',
    run() {
      const iterableRealm = createRealm();
      const generatorRealm = createRealm();
      assertSame(
        iterableRealm.agent.wellKnownSymbols.iterator ===
          generatorRealm.agent.wellKnownSymbols.iterator,
        false,
      );

      const foreignValues = /** @type {EngineObject} */ (
        evaluateNormal(
          iterableRealm,
          `
            (function () {
              var started = false;
              var yielded = { value: 'foreign-yield', done: false };
              var iterator = {
                next: function (sent) {
                  if (!started) {
                    started = true;
                    return yielded;
                  }
                  return { value: 'foreign:' + sent, done: true };
                }
              };
              var iterable = {};
              iterable[Symbol.iterator] = function () {
                return iterator;
              };
              return { iterable: iterable, yielded: yielded };
            }());
          `,
        )
      );
      const foreignIterable = foreignValues.get('iterable');
      const foreignYieldResult = foreignValues.get('yielded');
      generatorRealm.globalObject.defineOwnProperty('foreignIterable', {
        value: foreignIterable,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const first = evaluateNormal(
        generatorRealm,
        `
          var delegated = (function* () {
            return yield* foreignIterable;
          }());
          delegated.next();
        `,
      );
      const result = evaluateNormal(generatorRealm, `delegated.next('sent');`);

      assertSame(first, foreignYieldResult);
      assertSame(first instanceof EngineObject, true);
      assertSame(result instanceof EngineObject, true);
      assertSame(
        /** @type {EngineObject} */ (first).getPrototype(),
        iterableRealm.intrinsics.objectPrototype,
      );
      assertSame(
        /** @type {EngineObject} */ (first).agent,
        iterableRealm.agent,
      );
      assertSame(
        /** @type {EngineObject} */ (result).getPrototype(),
        generatorRealm.intrinsics.objectPrototype,
      );
      assertSame(
        /** @type {EngineObject} */ (first).get('value'),
        'foreign-yield',
      );
      assertSame(/** @type {EngineObject} */ (first).get('done'), false);
      assertSame(
        /** @type {EngineObject} */ (result).get('value'),
        'foreign:sent',
      );
      assertSame(/** @type {EngineObject} */ (result).get('done'), true);
    },
  },
  {
    name: 'delegated throw forwards a done-false result unchanged without reading value',
    run() {
      assertSame(
        run(`
          var valueReads = 0;
          var thrownResult = {};
          Object.defineProperty(thrownResult, 'done', {
            get: function () {
              return false;
            }
          });
          Object.defineProperty(thrownResult, 'value', {
            get: function () {
              valueReads = valueReads + 1;
              return 'recovered';
            }
          });

          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            throw: function () {
              return thrownResult;
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          var delegated = (function* () {
            yield* iterator;
          }());
          delegated.next();
          var received = delegated.throw('reason');
          [received === thrownResult, valueReads, received.done].join(':');
        `),
        'true:0:false',
      );
    },
  },
  {
    name: 'delegated return forwards a done-false result unchanged without reading value',
    run() {
      assertSame(
        run(`
          var valueReads = 0;
          var returnedResult = {};
          Object.defineProperty(returnedResult, 'done', {
            get: function () {
              return false;
            }
          });
          Object.defineProperty(returnedResult, 'value', {
            get: function () {
              valueReads = valueReads + 1;
              return 'still-open';
            }
          });

          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: function () {
              return returnedResult;
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          var delegated = (function* () {
            yield* iterator;
          }());
          delegated.next();
          var received = delegated.return('stop');
          [received === returnedResult, valueReads, received.done].join(':');
        `),
        'true:0:false',
      );
    },
  },
  {
    name: 'delegated throw is looked up dynamically and a done-false result keeps delegating',
    run() {
      assertSame(
        run(`
          var throwGets = 0;
          var started = false;
          var iterator = {
            next: function (sent) {
              if (!started) {
                started = true;
                return { value: 'start', done: false };
              }
              return { value: 'next:' + sent, done: true };
            }
          };
          Object.defineProperty(iterator, 'throw', {
            configurable: true,
            get: function () {
              throwGets = throwGets + 1;
              var ordinal = throwGets;
              return function (reason) {
                return {
                  value:
                    'recover:' + ordinal + ':' + reason + ':' +
                    arguments.length + ':' + (this === iterator),
                  done: false
                };
              };
            }
          });
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          function* outer() {
            var value = yield* iterator;
            return 'outer:' + value;
          }

          var delegated = outer();
          var first = delegated.next();
          var recovered = delegated.throw('one');
          var recoveredAgain = delegated.throw('two');
          var result = delegated.next('sent');
          [
            first.value,
            first.done,
            recovered.value,
            recovered.done,
            recoveredAgain.value,
            recoveredAgain.done,
            result.value,
            result.done,
            throwGets
          ].join('|');
        `),
        'start|false|recover:1:one:1:true|false|' +
          'recover:2:two:1:true|false|outer:next:sent|true|2',
      );
    },
  },
  {
    name: 'delegated throw done-true completes the yield-star expression normally',
    run() {
      assertSame(
        run(`
          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            throw: function (reason) {
              return { value: 'handled:' + reason, done: true };
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          function* outer() {
            var value = yield* iterator;
            return 'after:' + value;
          }

          var delegated = outer();
          var first = delegated.next();
          var result = delegated.throw('reason');
          [
            first.value,
            first.done,
            result.value,
            result.done
          ].join('|');
        `),
        'start|false|after:handled:reason|true',
      );
    },
  },
  {
    name: 'an abrupt delegated throw method wins without closing the iterator',
    run() {
      assertSame(
        run(`
          var delegatedError = {};
          var original = {};
          var returnCalls = 0;
          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            throw: function () {
              throw delegatedError;
            },
            return: function () {
              returnCalls = returnCalls + 1;
              return {};
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          var delegated = (function* () {
            yield* iterator;
          }());
          delegated.next();
          var caught;
          try {
            delegated.throw(original);
          } catch (error) {
            caught = error;
          }
          [
            caught === delegatedError,
            caught === original,
            returnCalls
          ].join(':');
        `),
        'true:false:0',
      );
    },
  },
  {
    name: 'missing delegated throw closes with no argument then throws a Realm TypeError',
    run() {
      const realm = createRealm();
      const caught = evaluateNormal(
        realm,
        `
          var closeCalls = 0;
          var closeArguments = -1;
          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: function () {
              closeCalls = closeCalls + 1;
              closeArguments = arguments.length;
              return { value: 'closed', done: true };
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          var delegated = (function* () {
            yield* iterator;
          }());
          delegated.next();
          var caught;
          try {
            delegated.throw({});
          } catch (error) {
            caught = error;
          }
          caught;
        `,
      );

      assertSame(caught instanceof EngineObject, true);
      assertSame(
        /** @type {EngineObject} */ (caught).getPrototype(),
        realm.intrinsics.typeErrorPrototype,
      );
      assertSame(realm.globalObject.get('closeCalls'), 1);
      assertSame(realm.globalObject.get('closeArguments'), 0);
    },
  },
  {
    name: 'a close error wins over the original throw when delegated throw is missing',
    run() {
      assertSame(
        run(`
          var original = {};
          var closeError = {};
          var closeCalls = 0;
          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: function () {
              closeCalls = closeCalls + 1;
              throw closeError;
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          var delegated = (function* () {
            yield* iterator;
          }());
          delegated.next();
          var caught;
          try {
            delegated.throw(original);
          } catch (error) {
            caught = error;
          }
          [
            caught === closeError,
            caught === original,
            closeCalls
          ].join(':');
        `),
        'true:false:1',
      );
    },
  },
  {
    name: 'missing delegated return propagates the outer return completion',
    run() {
      assertSame(
        run(`
          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            }
          };
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          var delegated = (function* () {
            return yield* iterator;
          }());
          var first = delegated.next();
          var result = delegated.return(42);
          [
            first.value,
            first.done,
            result.value,
            result.done
          ].join(':');
        `),
        'start:false:42:true',
      );
    },
  },
  {
    name: 'delegated return is dynamic, done-false suspends again, and done-true propagates its value',
    run() {
      assertSame(
        run(`
          var returnGets = 0;
          var reachedAfterDelegation = false;
          var iterator = {
            next: function () {
              return { value: 'start', done: false };
            }
          };
          Object.defineProperty(iterator, 'return', {
            configurable: true,
            get: function () {
              returnGets = returnGets + 1;
              var ordinal = returnGets;
              return function (value) {
                return {
                  value:
                    'return:' + ordinal + ':' + String(value) + ':' +
                    arguments.length + ':' + (this === iterator),
                  done: ordinal === 2
                };
              };
            }
          });
          iterator[Symbol.iterator] = function () {
            return iterator;
          };

          function* outer() {
            var value = yield* iterator;
            reachedAfterDelegation = true;
            return 'normal:' + value;
          }

          var delegated = outer();
          var first = delegated.next();
          var stillDelegating = delegated.return(undefined);
          var result = delegated.return('stop');
          [
            first.value,
            first.done,
            stillDelegating.value,
            stillDelegating.done,
            result.value,
            result.done,
            returnGets,
            reachedAfterDelegation
          ].join('|');
        `),
        'start|false|return:1:undefined:1:true|false|' +
          'return:2:stop:1:true|true|2|false',
      );
    },
  },
  {
    name: 'yield star rejects non-callable delegated next throw and return methods',
    run() {
      assertSame(
        run(`
          function iterable(iterator) {
            var value = {};
            value[Symbol.iterator] = function () {
              return iterator;
            };
            return value;
          }
          function* delegate(value) {
            return yield* value;
          }
          function errorName(operation) {
            try {
              operation();
            } catch (error) {
              return error.name;
            }
            return 'none';
          }

          var badNext = delegate(iterable({ next: 1 }));
          var nextError = errorName(function () {
            badNext.next();
          });

          var throwIterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            throw: 1
          };
          var badThrow = delegate(iterable(throwIterator));
          badThrow.next();
          var throwError = errorName(function () {
            badThrow.throw('reason');
          });

          var returnIterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: 1
          };
          var badReturn = delegate(iterable(returnIterator));
          badReturn.next();
          var returnError = errorName(function () {
            badReturn.return('value');
          });

          [nextError, throwError, returnError].join(':');
        `),
        'TypeError:TypeError:TypeError',
      );
    },
  },
  {
    name: 'yield star rejects non-object next throw return and close results',
    run() {
      assertSame(
        run(`
          function iterable(iterator) {
            var value = {};
            value[Symbol.iterator] = function () {
              return iterator;
            };
            return value;
          }
          function* delegate(value) {
            return yield* value;
          }
          function errorName(operation) {
            try {
              operation();
            } catch (error) {
              return error.name;
            }
            return 'none';
          }

          var badNext = delegate(iterable({
            next: function () {
              return 1;
            }
          }));
          var nextError = errorName(function () {
            badNext.next();
          });

          var throwIterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            throw: function () {
              return null;
            }
          };
          var badThrow = delegate(iterable(throwIterator));
          badThrow.next();
          var throwError = errorName(function () {
            badThrow.throw('reason');
          });

          var returnIterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: function () {
              return 'primitive';
            }
          };
          var badReturn = delegate(iterable(returnIterator));
          badReturn.next();
          var returnError = errorName(function () {
            badReturn.return('value');
          });

          var closeIterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: function () {
              return 2;
            }
          };
          var badClose = delegate(iterable(closeIterator));
          badClose.next();
          var closeError = errorName(function () {
            badClose.throw('reason');
          });

          [nextError, throwError, returnError, closeError].join(':');
        `),
        'TypeError:TypeError:TypeError:TypeError',
      );
    },
  },
  {
    name: 'abrupt throw return done and value getters propagate in protocol order',
    run() {
      assertSame(
        run(`
          function iterable(iterator) {
            var value = {};
            value[Symbol.iterator] = function () {
              return iterator;
            };
            return value;
          }
          function* delegate(value) {
            return yield* value;
          }
          function catches(operation, expected) {
            try {
              operation();
            } catch (error) {
              return error === expected;
            }
            return false;
          }

          var throwError = {};
          var throwCloseCalls = 0;
          var throwIterator = {
            next: function () {
              return { value: 'start', done: false };
            },
            return: function () {
              throwCloseCalls = throwCloseCalls + 1;
              return {};
            }
          };
          Object.defineProperty(throwIterator, 'throw', {
            get: function () {
              throw throwError;
            }
          });
          var abruptThrow = delegate(iterable(throwIterator));
          abruptThrow.next();
          var caughtThrow = catches(function () {
            abruptThrow.throw('reason');
          }, throwError);

          var returnError = {};
          var returnIterator = {
            next: function () {
              return { value: 'start', done: false };
            }
          };
          Object.defineProperty(returnIterator, 'return', {
            get: function () {
              throw returnError;
            }
          });
          var abruptReturn = delegate(iterable(returnIterator));
          abruptReturn.next();
          var caughtReturn = catches(function () {
            abruptReturn.return('value');
          }, returnError);

          var doneError = {};
          var doneValueReads = 0;
          var doneIterator = {
            next: function () {
              var result = {};
              Object.defineProperty(result, 'done', {
                get: function () {
                  throw doneError;
                }
              });
              Object.defineProperty(result, 'value', {
                get: function () {
                  doneValueReads = doneValueReads + 1;
                  return 'unreachable';
                }
              });
              return result;
            }
          };
          var abruptDone = delegate(iterable(doneIterator));
          var caughtDone = catches(function () {
            abruptDone.next();
          }, doneError);

          var valueError = {};
          var valueDoneReads = 0;
          var valueIterator = {
            next: function () {
              var result = {};
              Object.defineProperty(result, 'done', {
                get: function () {
                  valueDoneReads = valueDoneReads + 1;
                  return true;
                }
              });
              Object.defineProperty(result, 'value', {
                get: function () {
                  throw valueError;
                }
              });
              return result;
            }
          };
          var abruptValue = delegate(iterable(valueIterator));
          var caughtValue = catches(function () {
            abruptValue.next();
          }, valueError);

          [
            caughtThrow,
            throwCloseCalls,
            caughtReturn,
            caughtDone,
            doneValueReads,
            caughtValue,
            valueDoneReads
          ].join(':');
        `),
        'true:0:true:true:0:true:1',
      );
    },
  },
];

export default tests;
