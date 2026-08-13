import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function val(realm, source) {
  const completion = evaluateScript(realm, source);
  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }
  return completion.value;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'object declarations read properties left to right and default only undefined',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var log = [];
            var source = {
              get first() {
                log.push('first');
                return 1;
              },
              get second() {
                log.push('second');
                return undefined;
              }
            };
            var { first: a, second: b = 2 } = source;
            log.join(',') + ':' + a + ':' + b;
          `,
        ),
        'first,second:1:2',
      );
      assertSame(
        val(
          createRealm(),
          'var { a = 1, b = 2 } = { a: null, b: undefined }; String(a) + ":" + b;',
        ),
        'null:2',
      );
    },
  },
  {
    name: 'an array declaration consumes its iterator once and closes on early completion',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var nextCalls = 0, returnCalls = 0;
            var iterable = {};
            iterable[Symbol.iterator] = function () {
              return {
                next: function () {
                  nextCalls += 1;
                  return { value: nextCalls, done: false };
                },
                return: function () {
                  returnCalls += 1;
                  return {};
                }
              };
            };
            var [head] = iterable;
            head + ':' + nextCalls + ':' + returnCalls;
          `,
        ),
        '1:1:1',
      );
    },
  },
  {
    name: 'nested patterns, holes, array rest, and computed object keys compose',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var keyCalls = 0;
            function key() { keyCalls += 1; return 'payload'; }
            const { [key()]: [, { value: nested }, ...tail] } = {
              payload: [0, { value: 7 }, 8, 9]
            };
            keyCalls + ':' + nested + ':' + tail.join(',');
          `,
        ),
        '1:7:8,9',
      );
    },
  },
  {
    name: 'destructuring assignment returns its right value and supports member targets',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var targets = [{ x: 0 }], index = 0;
            var right = [7];
            var result = ([targets[index++].x] = right);
            (result === right) + ':' + targets[0].x + ':' + index;
          `,
        ),
        'true:7:1',
      );
      assertSame(
        val(
          createRealm(),
          'var target = {}; var source = { x: 4 }; var result = ({ x: target.y } = source); (result === source) + ":" + target.y;',
        ),
        'true:4',
      );
    },
  },
  {
    name: 'var let and const declarations initialize every bound name',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var [a, { b: c }] = [1, { b: 2 }];
            let { d, e: [f] } = { d: 3, e: [4] };
            const [g = 5] = [];
            a + c + d + f + g;
          `,
        ),
        15,
      );
    },
  },
  {
    name: 'classic for, for-in, and for-of heads support binding patterns',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var classic = 0;
            for (let [i] = [0]; i < 3; [i] = [i + 1]) classic += i;
            var keyLengths = 0;
            for (var { length: size } in { abc: 1, de: 2 }) keyLengths += size;
            var pairs = '';
            for (const [left, right] of [[1, 2], [3, 4]]) pairs += left + ':' + right + ',';
            classic + ':' + keyLengths + ':' + pairs;
          `,
        ),
        '3:5:1:2,3:4,',
      );
      assertSame(val(createRealm(), 'var x; for ([x] of [[6], [9]]) {} x;'), 9);
    },
  },
  {
    name: 'lexical for-of patterns create fresh per-iteration bindings',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var functions = [];
            for (let [x] of [[1], [2], [3]]) {
              functions.push(function () { return x; });
            }
            functions[0]() + ',' + functions[1]() + ',' + functions[2]();
          `,
        ),
        '1,2,3',
      );
    },
  },
  {
    name: 'a binding throw closes the iterator and wins over a throwing return',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var returnCalls = 0;
            var iterable = {};
            iterable[Symbol.iterator] = function () {
              return {
                next: function () { return { value: undefined, done: false }; },
                return: function () {
                  returnCalls += 1;
                  throw new TypeError('close');
                }
              };
            };
            function fail() { throw new RangeError('original'); }
            var caught = '';
            try { var [x = fail()] = iterable; }
            catch (error) { caught = error.name + ':' + error.message; }
            caught + ':' + returnCalls;
          `,
        ),
        'RangeError:original:1',
      );
    },
  },
  {
    name: 'assignment targets are evaluated before their source values are read',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var log = [], target = {};
            function key() { log.push('target'); return 'value'; }
            var iterable = {};
            iterable[Symbol.iterator] = function () {
              return {
                next: function () {
                  log.push('next');
                  return { value: 1, done: false };
                },
                return: function () { return {}; }
              };
            };
            [target[key()]] = iterable;
            log.join(',');
          `,
        ),
        'target,next',
      );
      assertSame(
        val(
          createRealm(),
          `
            var log = [], target = {};
            function key() { log.push('target'); return 'value'; }
            var source = {
              get property() { log.push('get'); return 1; }
            };
            ({ property: target[key()] } = source);
            log.join(',');
          `,
        ),
        'target,get',
      );
    },
  },
  {
    name: 'anonymous function defaults receive the identifier target name',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var [arrayFunction = function () {}] = [];
            var { objectFunction = function () {} } = {};
            var assigned;
            [assigned = function () {}] = [];
            arrayFunction.name + ':' + objectFunction.name + ':' + assigned.name;
          `,
        ),
        'arrayFunction:objectFunction:assigned',
      );
    },
  },
  {
    name: 'object patterns preserve a primitive receiver for inherited accessors',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            Object.defineProperty(String.prototype, 'receiverType', {
              get: function () { 'use strict'; return typeof this; },
              configurable: true
            });
            var { receiverType: type } = 'value';
            type;
          `,
        ),
        'string',
      );
    },
  },
  {
    name: 'iterator step and value failures do not close an array-pattern iterator',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var closed = false, iterable = {};
            iterable[Symbol.iterator] = function () {
              return {
                next: function () { throw new RangeError('step'); },
                return: function () { closed = true; return {}; }
              };
            };
            try { var [x] = iterable; } catch (error) {}
            closed;
          `,
        ),
        false,
      );
      assertSame(
        val(
          createRealm(),
          `
            var closed = false, iterable = {};
            iterable[Symbol.iterator] = function () {
              return {
                next: function () {
                  var result = { done: false };
                  Object.defineProperty(result, 'value', {
                    get: function () { throw new RangeError('value'); }
                  });
                  return result;
                },
                return: function () { closed = true; return {}; }
              };
            };
            try { var [x] = iterable; } catch (error) {}
            closed;
          `,
        ),
        false,
      );
    },
  },
  {
    name: 'var pattern bindings resolve after their source values are read',
    run() {
      assertSame(
        val(
          createRealm(),
          `
            var target = 'global';
            var scope = { target: 'with' };
            var source = {
              get value() {
                delete scope.target;
                return 'value';
              }
            };
            with (scope) {
              var { value: target } = source;
            }
            scope.hasOwnProperty('target') + ':' + String(scope.target) + ':' + target;
          `,
        ),
        'false:undefined:value',
      );
    },
  },
];

export default tests;
