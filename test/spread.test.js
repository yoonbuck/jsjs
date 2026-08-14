import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);

  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }

  return completion.value;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'call spread expands ordinary and multiple iterable operands left to right',
    run() {
      assertSame(
        run(
          'var order = []; ' +
            'function mark(name, value) { order.push(name); return value; } ' +
            'function f() { return Array.prototype.join.call(arguments, ","); } ' +
            'var result = f(mark("a", 1), ...mark("first", [2, 3]), mark("b", 4), ...mark("last", [5, 6])); ' +
            'order.join(",") + ":" + result;',
        ),
        'a,first,b,last:1,2,3,4,5,6',
      );
    },
  },
  {
    name: 'array spread uses string code-point iteration',
    run() {
      assertSame(
        run('var a = [0, ..."𝌆", 2]; a.length + ":" + a[1] + ":" + a[2];'),
        '3:𝌆:2',
      );
    },
  },
  {
    name: 'array spread preserves explicit holes while defining spread undefined values',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var a = [0, , ...[undefined], , 3];',
      );
      assertSame(completion.type, 'normal');

      const array = /** @type {any} */ (realm.globalObject.get('a'));
      assertSame(array.getOwnProperty('1'), undefined);
      assertSame(array.getOwnProperty('2').value, undefined);
      assertSame(array.getOwnProperty('3'), undefined);
      assertSame(array.getOwnProperty('4').value, 3);
      assertSame(array.get('length'), 5);
    },
  },
  {
    name: 'spread arguments reach ordinary and bound functions',
    run() {
      assertSame(
        run(
          'function join(a, b, c) { return a + ":" + b + ":" + c; } ' +
            'var bound = join.bind(null, "a"); bound(...["b"], ...["c"]);',
        ),
        'a:b:c',
      );
    },
  },
  {
    name: 'construction expands spread arguments left to right',
    run() {
      assertSame(
        run(
          'var order = ""; ' +
            'function mark(name, value) { order = order + name; return value; } ' +
            'function C(a, b, c) { this.value = a + ":" + b + ":" + c; } ' +
            'var instance = new C(mark("a", 1), ...mark("b", [2]), ...mark("c", [3])); ' +
            'order + ":" + instance.value;',
        ),
        'abc:1:2:3',
      );
    },
  },
  {
    name: 'spread throws a guest TypeError for a non-iterable value',
    run() {
      assertSame(
        run(
          'function f() {} var name; try { f(...{}); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'spread captures a custom iterator next method once',
    run() {
      assertSame(
        run(
          'var lookups = 0; var calls = 0; ' +
            'var iterator = {}; ' +
            'function next() { calls = calls + 1; return calls < 3 ? { value: calls, done: false } : { done: true }; } ' +
            'Object.defineProperty(iterator, "next", { get: function () { lookups = lookups + 1; return next; } }); ' +
            'var iterable = {}; iterable[Symbol.iterator] = function () { return iterator; }; ' +
            'function f(a, b) { return lookups + ":" + calls + ":" + a + ":" + b; } ' +
            'f(...iterable);',
        ),
        '1:3:1:2',
      );
    },
  },
  {
    name: 'spread propagates iterator step and value failures without IteratorClose',
    run() {
      assertSame(
        run(
          'function f() {} ' +
            'var stepClosed = 0; var stepIterator = {}; ' +
            'stepIterator.next = function () { throw "step"; }; ' +
            'stepIterator.return = function () { stepClosed = stepClosed + 1; return {}; }; ' +
            'var stepIterable = {}; stepIterable[Symbol.iterator] = function () { return stepIterator; }; ' +
            'var stepError; try { f(...stepIterable); } catch (error) { stepError = error; } ' +
            'var valueClosed = 0; var valueIterator = {}; ' +
            'valueIterator.next = function () { var result = { done: false }; Object.defineProperty(result, "value", { get: function () { throw "value"; } }); return result; }; ' +
            'valueIterator.return = function () { valueClosed = valueClosed + 1; return {}; }; ' +
            'var valueIterable = {}; valueIterable[Symbol.iterator] = function () { return valueIterator; }; ' +
            'var valueError; try { f(...valueIterable); } catch (error) { valueError = error; } ' +
            'stepError + ":" + stepClosed + ":" + valueError + ":" + valueClosed;',
        ),
        'step:0:value:0',
      );
    },
  },
  {
    name: 'call spread transports more arguments than host argument expansion permits',
    run() {
      assertSame(
        run(
          'function count() { return arguments.length; } count(...Array(130000));',
        ),
        130000,
      );
    },
  },
];

export default tests;
