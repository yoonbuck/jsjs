import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * Evaluates `source` in a fresh realm, requiring a normal completion, and
 * returns its value.
 *
 * @param {string} source
 * @returns {unknown}
 */
function val(source) {
  const completion = evaluateScript(createRealm(), source);
  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }
  return completion.value;
}

/**
 * A reusable guest prelude that builds a tracked iterable over a list of
 * values. The iterable exposes an observable `log` with `nextCount`,
 * `returnCount`, and `returned`, and its `return` method behaves per the
 * `returnMode` argument passed to `makeIterable`.
 */
const ITERABLE_PRELUDE = `
  function makeIterable(values, returnMode) {
    var log = { nextCount: 0, returnCount: 0, returned: false };
    var iterable = {};
    iterable[Symbol.iterator] = function () {
      var i = 0;
      var iterator = {};
      iterator.next = function () {
        log.nextCount = log.nextCount + 1;
        if (i < values.length) {
          var v = values[i];
          i = i + 1;
          return { value: v, done: false };
        }
        return { value: undefined, done: true };
      };
      if (returnMode !== 'none') {
        iterator['return'] = function () {
          log.returnCount = log.returnCount + 1;
          log.returned = true;
          if (returnMode === 'throw') {
            throw new Error('return blew up');
          }
          if (returnMode === 'nonobject') {
            return 42;
          }
          return { done: true };
        };
      }
      return iterator;
    };
    return { iterable: iterable, log: log };
  }
`;

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'for-of over an array binds each element value in order',
    run() {
      assertSame(
        val(
          'var out = []; for (var x of [10, 20, 30]) out.push(x); out.join(",");',
        ),
        '10,20,30',
      );
    },
  },
  {
    name: 'for-of sums array elements through a var head',
    run() {
      assertSame(val('var s = 0; for (var x of [1, 2, 3, 4]) s += x; s;'), 10);
    },
  },
  {
    name: 'for-of over a string iterates by code point, combining surrogate pairs',
    run() {
      assertSame(
        val(
          'var out = []; for (var c of "a\\uD83D\\uDE00b") out.push(c); out.length;',
        ),
        3,
      );
      assertSame(
        val(
          'var out = []; for (var c of "a\\uD83D\\uDE00b") out.push(c.length); out.join(",");',
        ),
        '1,2,1',
      );
    },
  },
  {
    name: 'for-of over an empty array runs the body zero times and completes normally',
    run() {
      assertSame(val('var n = 0; for (var x of []) n += 1; n;'), 0);
    },
  },
  {
    name: 'for-of drives a custom iterable through Symbol.iterator',
    run() {
      assertSame(
        val(
          ITERABLE_PRELUDE +
            'var m = makeIterable([5, 6, 7], "return");' +
            'var s = 0; for (var x of m.iterable) s += x;' +
            's + ":" + m.log.nextCount + ":" + m.log.returned;',
        ),
        // Four next() calls (three values plus the done result); no close on
        // natural exhaustion.
        '18:4:false',
      );
    },
  },
  {
    name: 'let head creates a fresh per-iteration binding captured by closures',
    run() {
      assertSame(
        val(
          'var fs = [];' +
            'for (let x of [1, 2, 3]) fs.push(function () { return x; });' +
            'fs[0]() + "," + fs[1]() + "," + fs[2]();',
        ),
        '1,2,3',
      );
    },
  },
  {
    name: 'var head shares a single binding, so closures observe the final value',
    run() {
      assertSame(
        val(
          'var fs = [];' +
            'for (var x of [1, 2, 3]) fs.push(function () { return x; });' +
            'fs[0]() + "," + fs[1]() + "," + fs[2]();',
        ),
        '3,3,3',
      );
    },
  },
  {
    name: 'const head binds each value and rejects assignment to the loop variable',
    run() {
      assertSame(val('var s = 0; for (const x of [4, 5, 6]) s += x; s;'), 15);
      const completion = evaluateScript(
        createRealm(),
        'for (const x of [1]) { x = 2; }',
      );
      assertSame(completion.type, 'throw');
    },
  },
  {
    name: 'a lexical head evaluates its iterable under the TDZ, so referencing the loop name throws',
    run() {
      const completion = evaluateScript(createRealm(), 'for (let x of x) {}');
      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {any} */ (completion.value).get('name'),
        'ReferenceError',
      );
    },
  },
  {
    name: 'a var head does not shadow an outer binding while evaluating the iterable',
    run() {
      assertSame(
        val('var x = [1, 2, 3]; var s = 0; for (var x of x) s += x; s;'),
        6,
      );
    },
  },
  {
    name: 'for-of over a non-iterable value throws a TypeError',
    run() {
      const completion = evaluateScript(createRealm(), 'for (var x of 5) {}');
      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {any} */ (completion.value).get('name'),
        'TypeError',
      );
    },
  },
  {
    name: 'break closes the iterator via its return method',
    run() {
      assertSame(
        val(
          ITERABLE_PRELUDE +
            'var m = makeIterable([1, 2, 3, 4], "return");' +
            'var s = 0; for (var x of m.iterable) { if (x === 3) break; s += x; }' +
            's + ":" + m.log.returnCount;',
        ),
        '3:1',
      );
    },
  },
  {
    name: 'return from an enclosing function closes the iterator',
    run() {
      assertSame(
        val(
          ITERABLE_PRELUDE +
            'var m = makeIterable([1, 2, 3], "return");' +
            'function f() {' +
            '  for (var x of m.iterable) { if (x === 2) return x; }' +
            '  return -1;' +
            '}' +
            'var r = f();' +
            'r + ":" + m.log.returnCount;',
        ),
        // The function returned at value 2, and IteratorClose called return()
        // exactly once as the return completion unwound out of the loop.
        '2:1',
      );
    },
  },
  {
    name: 'a throw from the body closes the iterator and the original throw wins over a throwing return',
    run() {
      const completion = evaluateScript(
        createRealm(),
        ITERABLE_PRELUDE +
          'var m = makeIterable([1, 2, 3], "throw");' +
          'for (var x of m.iterable) { if (x === 2) throw new RangeError("body"); }',
      );
      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {any} */ (completion.value).get('name'),
        'RangeError',
      );
    },
  },
  {
    name: 'continue keeps iterating and never closes the iterator',
    run() {
      assertSame(
        val(
          ITERABLE_PRELUDE +
            'var m = makeIterable([1, 2, 3, 4], "return");' +
            'var s = 0; for (var x of m.iterable) { if (x % 2 === 0) continue; s += x; }' +
            's + ":" + m.log.returned;',
        ),
        '4:false',
      );
    },
  },
  {
    name: 'an assignment target is re-evaluated to a fresh reference each iteration',
    run() {
      assertSame(val('var o = {}; for (o.k of [7, 8, 9]); o.k;'), 9);
    },
  },
  {
    name: 'a labeled break closes the iterator and exits the outer loop',
    run() {
      assertSame(
        val(
          ITERABLE_PRELUDE +
            'var m = makeIterable([1, 2, 3], "return");' +
            'var hit = 0;' +
            'outer: for (var i = 0; i < 1; i += 1) {' +
            '  for (var x of m.iterable) { hit += 1; if (x === 2) break outer; }' +
            '}' +
            'hit + ":" + m.log.returned;',
        ),
        '2:true',
      );
    },
  },
  {
    name: 'closing on a normal break surfaces a TypeError when return yields a non-object',
    run() {
      const completion = evaluateScript(
        createRealm(),
        ITERABLE_PRELUDE +
          'var m = makeIterable([1, 2, 3], "nonobject");' +
          'for (var x of m.iterable) { if (x === 1) break; }',
      );
      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {any} */ (completion.value).get('name'),
        'TypeError',
      );
    },
  },
  {
    name: 'when next itself throws the iterator is not closed',
    run() {
      assertSame(
        val(
          'var returned = false;' +
            'var iterable = {};' +
            'iterable[Symbol.iterator] = function () {' +
            '  return {' +
            '    next: function () { throw new RangeError("boom"); },' +
            "    'return': function () { returned = true; return {}; }" +
            '  };' +
            '};' +
            'var caught = "none";' +
            'try { for (var x of iterable) {} } catch (e) { caught = e.name; }' +
            'caught + ":" + returned;',
        ),
        'RangeError:false',
      );
    },
  },
  {
    name: 'Array.prototype[Symbol.iterator] is the same function object as Array.prototype.values',
    run() {
      assertSame(
        val('Array.prototype[Symbol.iterator] === Array.prototype.values;'),
        true,
      );
    },
  },
  {
    name: 'for-of consumes an explicit Array iterator object (entries)',
    run() {
      assertSame(
        val(
          'var out = [];' +
            'for (var pair of ["a", "b"].entries()) out.push(pair[0] + ":" + pair[1]);' +
            'out.join(",");',
        ),
        '0:a,1:b',
      );
    },
  },
];

export default tests;
