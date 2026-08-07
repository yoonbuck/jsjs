import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineArray } from '../src/runtime/array-object.js';

/**
 * @typedef {import('../src/runtime/object.js').EngineObject} EngineObject
 */

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

const tests = [
  {
    name: 'Array call and construction create realm arrays',
    run() {
      const realm = createRealm();

      assertSame(evaluateScript(realm, 'typeof Array;').value, 'function');
      evaluateScript(
        realm,
        'var called = Array(); var constructed = new Array();',
      );

      const called = realm.globalObject.get('called');
      const constructed = realm.globalObject.get('constructed');

      assertSame(called instanceof EngineArray, true);
      assertSame(constructed instanceof EngineArray, true);
      assertSame(/** @type {EngineObject} */ (called).get('length'), 0);
      assertSame(/** @type {EngineObject} */ (constructed).get('length'), 0);
      assertSame(
        /** @type {EngineObject} */ (called).getPrototype(),
        realm.intrinsics.arrayPrototype,
      );
    },
  },
  {
    name: 'Array single-number construction creates sparse validated lengths',
    run() {
      assertSame(
        run(
          'var a = Array(3); a.length + ":" + a.hasOwnProperty("0") + ":" + ' +
            'a.hasOwnProperty("2");',
        ),
        '3:false:false',
      );
      assertSame(
        run(
          'var name; try { Array(1.5); } catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
      assertSame(
        run(
          'var name; try { new Array(-1); } catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'Array non-number and multiple arguments initialize dense elements',
    run() {
      assertSame(run('var a = Array("3"); a.length + ":" + a[0];'), '1:3');
      assertSame(
        run(
          'var a = new Array("a", 2, true); a.length + ":" + a[0] + a[1] + a[2];',
        ),
        '3:a2true',
      );
      assertSame(
        run('var value = {}; var a = Array(value); a[0] === value;'),
        true,
      );
    },
  },
  {
    name: 'Array isArray recognizes only array exotic objects',
    run() {
      assertSame(run('Array.isArray([]);'), true);
      assertSame(run('Array.isArray(Array.prototype);'), true);
      assertSame(run('Array.isArray(new Array(1));'), true);
      assertSame(run('Array.isArray({0: "x", length: 1});'), false);
      assertSame(run('Array.isArray("x");'), false);
    },
  },
  {
    name: 'Array prototype and constructor wiring is realm-local',
    run() {
      const realmOne = createRealm();
      const realmTwo = createRealm();
      const constructor = /** @type {EngineObject} */ (
        realmOne.globalObject.get('Array')
      );

      assertSame(
        constructor.get('prototype'),
        realmOne.intrinsics.arrayPrototype,
      );
      assertSame(
        realmOne.intrinsics.arrayPrototype.get('constructor'),
        constructor,
      );
      assertSame(realmOne.intrinsics.arrayPrototype.get('length'), 0);
      assertSame(
        evaluateScript(
          realmOne,
          'Object.getPrototypeOf([]) === Array.prototype;',
        ).value,
        true,
      );
      assertSame(
        realmOne.intrinsics.arrayPrototype ===
          realmTwo.intrinsics.arrayPrototype,
        false,
      );
      assertSame(
        realmOne.intrinsics.arrayPrototype.getPrototype(),
        realmOne.intrinsics.objectPrototype,
      );
    },
  },
  {
    name: 'Array string coercion delegates to its comma-joined elements',
    run() {
      assertSame(run("[1, 2] + '';"), '1,2');
      assertSame(run('1 + [2];'), '12');
      assertSame(run('[1] == 1;'), true);
    },
  },
  {
    name: 'Array toString falls back to Object toString for a non-callable join',
    run() {
      assertSame(
        run(
          'var a = []; a.join = 1; ' +
            'a.toString() + ":" + Array.prototype.toString.call({join: null});',
        ),
        '[object Array]:[object Object]',
      );
      assertSame(
        run(
          'var arrayToString = Array.prototype.toString; ' +
            'Object.prototype.toString = function () { return "changed"; }; ' +
            'var a = []; a.join = null; arrayToString.call(a);',
        ),
        '[object Array]',
      );
    },
  },
  {
    name: 'Array toLocaleString converts each non-nullish element in order',
    run() {
      assertSame(
        run('[1, "x", true, null, undefined].toLocaleString();'),
        '1,x,true,,',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var first = {toLocaleString: function () { order = order + "a"; return "A"; }}; ' +
            'var last = {toLocaleString: function () { order = order + "b"; return "B"; }}; ' +
            'var value = Array.prototype.toLocaleString.call({0: first, 2: last, length: 3}); ' +
            'value + ":" + order;',
        ),
        'A,,B:ab',
      );
      assertSame(
        run(
          'var name; try { [{toLocaleString: 1}].toLocaleString(); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'Object.prototype.toLocaleString = function () { "use strict"; return typeof this; }; ' +
            '[5, "x", true].toLocaleString();',
        ),
        // Number.prototype.toLocaleString (ES5 15.7.4.3) shadows the
        // overridden Object.prototype.toLocaleString for the Number
        // element, so only the String and Boolean elements (which have no
        // own toLocaleString) observe the override — and they observe it
        // with the boxed wrapper 15.4.4.3 step 10.d.i creates as `this`.
        '5,object,object',
      );
    },
  },
  {
    name: 'Array toLocaleString dispatches through the boxed element wrapper',
    run() {
      // ES5 15.4.4.3 steps 8.a-8.d and 10.d.i-10.d.iv box every non-nullish
      // element with ToObject and then [[Get]] "toLocaleString" off the
      // wrapper, so an inherited Object.prototype.toLocaleString is really
      // invoked and reaches a replaced Boolean.prototype.toString.
      assertSame(
        run(
          'Boolean.prototype.toString = function () { return typeof this; }; ' +
            '[true, false].toLocaleString();',
        ),
        'object,object',
      );
    },
  },
  {
    name: 'Array toLocaleString passes the boxed wrapper as this in strict mode',
    run() {
      // The receiver 15.4.4.3 step 10.d.iv passes is `elementObj`, not the
      // raw primitive, so a strict callee — which never re-boxes `this` —
      // still observes an object.
      assertSame(
        run(
          '"use strict"; ' +
            'Number.prototype.toLocaleString = function () { return typeof this; }; ' +
            '[1,2].toLocaleString();',
        ),
        'object,object',
      );
    },
  },
  {
    name: 'Array toLocaleString boxes a primitive element once and reuses that wrapper',
    run() {
      // 15.4.4.3 calls ToObject once per element (step 10.d.i) and uses that
      // same `elementObj` both for the [[Get]] and as the call receiver, so
      // the receiver a strict callee sees is a wrapper for the element's own
      // value rather than a fresh box of something else.
      assertSame(
        run(
          '"use strict"; ' +
            'String.prototype.toLocaleString = function () { return typeof this + ":" + this.valueOf(); }; ' +
            '["a"].toLocaleString();',
        ),
        'object:a',
      );
    },
  },
  {
    name: 'Array push and pop are generic and preserve their specified return values',
    run() {
      assertSame(
        run(
          'var a = [1]; var pushed = a.push(2, 3); var popped = a.pop(); ' +
            'pushed + ":" + popped + ":" + a.length + ":" + a[1];',
        ),
        '3:3:2:2',
      );
      assertSame(
        run(
          'var o = {0: "a", length: 1}; var length = ' +
            'Array.prototype.push.call(o, "b"); var value = ' +
            'Array.prototype.pop.call(o); length + ":" + value + ":" + o.length;',
        ),
        '2:b:1',
      );
      assertSame(
        run(
          'Array.prototype[1] = "inherited"; var a = Array(2); ' +
            'var value = a.pop(); value + ":" + a.length;',
        ),
        'inherited:1',
      );
    },
  },
  {
    name: 'Array shift and unshift preserve sparse and inherited indexed values',
    run() {
      assertSame(
        run(
          'var a = [1, 2, 3]; var shifted = a.shift(); var length = a.unshift("a", "b"); ' +
            'shifted + ":" + length + ":" + a[0] + ":" + a[1] + ":" + a[2];',
        ),
        '1:4:a:b:2',
      );
      assertSame(
        run(
          'Array.prototype[1] = "inherited"; var a = Array(3); a[2] = "own"; ' +
            'var first = a.shift(); ' +
            'first + ":" + a.length + ":" + a[0] + ":" + a[1] + ":" + ' +
            'a.hasOwnProperty("0") + ":" + a.hasOwnProperty("1");',
        ),
        'undefined:2:inherited:own:true:true',
      );
      assertSame(
        run(
          'var o = {0: "x", length: 1}; var length = ' +
            'Array.prototype.unshift.call(o, "a", "b"); ' +
            'length + ":" + o[0] + ":" + o[1] + ":" + o[2];',
        ),
        '3:a:b:x',
      );
    },
  },
  {
    name: 'Array reverse preserves holes and observes inherited properties',
    run() {
      assertSame(
        run(
          'var a = Array(3); a[0] = "x"; var returned = a.reverse(); ' +
            '(returned === a) + ":" + a.hasOwnProperty("0") + ":" + ' +
            'a.hasOwnProperty("2") + ":" + a[2];',
        ),
        'true:false:true:x',
      );
      assertSame(
        run(
          'Array.prototype[0] = "inherited"; var a = Array(2); a[1] = "own"; ' +
            'a.reverse(); a[0] + ":" + a[1] + ":" + a.hasOwnProperty("1");',
        ),
        'own:inherited:true',
      );
    },
  },
  {
    name: 'Array sort orders defined values before undefined and sparse holes',
    run() {
      assertSame(
        run(
          'var a = Array(5); a[0] = "b"; a[2] = undefined; a[4] = "a"; ' +
            'var returned = a.sort(); (returned === a) + ":" + a[0] + ":" + ' +
            'a[1] + ":" + a.hasOwnProperty("2") + ":" + ' +
            'a.hasOwnProperty("3") + ":" + a.hasOwnProperty("4");',
        ),
        'true:a:b:true:false:false',
      );
      assertSame(
        run(
          'var a = [3, 1, 2]; a.sort(function (left, right) { return left - right; }); ' +
            'a[0] + ":" + a[1] + ":" + a[2];',
        ),
        '1:2:3',
      );
      assertSame(
        run(
          'var value; try { [2, 1].sort(function () { throw "stop"; }); } ' +
            'catch (error) { value = error; } value;',
        ),
        'stop',
      );
      assertSame(
        run(
          'var name; try { [1].sort(1); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Array splice returns removed arrays and shifts sparse generic receivers',
    run() {
      assertSame(
        run(
          'var a = [0, 1, 2, 3]; var removed = a.splice(1, 2, "a", "b", "c"); ' +
            'removed.length + ":" + removed[0] + ":" + removed[1] + ":" + ' +
            'a.length + ":" + a[1] + ":" + a[3] + ":" + a[4];',
        ),
        '2:1:2:5:a:c:3',
      );
      assertSame(
        run(
          'var a = Array(3); a[1] = "x"; var removed = a.splice(0, 3); ' +
            'removed.length + ":" + removed.hasOwnProperty("0") + ":" + ' +
            'removed.hasOwnProperty("1") + ":" + removed.hasOwnProperty("2") + ":" + ' +
            'a.length;',
        ),
        '3:false:true:false:0',
      );
      assertSame(
        run(
          'var o = {0: "a", 1: "b", length: 2}; var removed = ' +
            'Array.prototype.splice.call(o, 1, 1, "x", "y"); ' +
            'removed[0] + ":" + o.length + ":" + o[1] + ":" + o[2];',
        ),
        'b:3:x:y',
      );
      assertSame(
        run(
          'var a = [0, 1, 2]; var removed = a.splice(1); ' +
            'removed.length + ":" + removed[0] + ":" + removed[1] + ":" + a.length;',
        ),
        '2:1:2:1',
      );
      assertSame(
        run(
          'var a = [0, 1]; var removed = a.splice(); ' +
            'removed.length + ":" + a.length;',
        ),
        '0:2',
      );
    },
  },
  {
    name: 'Array mutations throw on forbidden writes after preserving earlier mutations',
    run() {
      assertSame(
        run(
          'var a = [1, 2]; Object.defineProperty(a, "length", {writable: false}); ' +
            'var name; try { a.push(3); } catch (error) { name = error.name; } ' +
            'name + ":" + a.length + ":" + a.hasOwnProperty("2");',
        ),
        'TypeError:2:false',
      );
      assertSame(
        run(
          'var a = [1, 2, 3]; Object.defineProperty(a, "2", {writable: false}); ' +
            'var name; try { a.reverse(); } catch (error) { name = error.name; } ' +
            'name + ":" + a[0] + ":" + a[2];',
        ),
        'TypeError:3:3',
      );
    },
  },
  {
    name: 'Array concat flattens arrays one level and preserves holes',
    run() {
      assertSame(
        run(
          'var nested = [2, [3]]; var result = [1].concat(nested, 4); ' +
            'result.length + ":" + result[0] + ":" + result[1] + ":" + ' +
            'Array.isArray(result[2]) + ":" + result[3];',
        ),
        '4:1:2:true:4',
      );
      assertSame(
        run(
          'var sparse = Array(2); sparse[1] = "x"; var result = [].concat(sparse); ' +
            'result.length + ":" + result.hasOwnProperty("0") + ":" + ' +
            'result.hasOwnProperty("1") + ":" + result[1];',
        ),
        '2:false:true:x',
      );
      assertSame(
        run(
          'var o = {0: "x", length: 1}; var result = Array.prototype.concat.call(o, "y"); ' +
            'result.length + ":" + (result[0] === o) + ":" + result[1];',
        ),
        '2:true:y',
      );
    },
  },
  {
    name: 'Array join and slice are generic and preserve holes where required',
    run() {
      assertSame(run('[1, null, undefined, 4].join("-");'), '1---4');
      assertSame(
        run('Array.prototype.join.call({0: "a", 2: "c", length: 3}, "|");'),
        'a||c',
      );
      assertSame(
        run(
          'var a = Array(4); a[1] = "x"; var result = a.slice(-3, 3); ' +
            'result.length + ":" + result.hasOwnProperty("0") + ":" + ' +
            'result[0] + ":" + result.hasOwnProperty("1");',
        ),
        '2:true:x:false',
      );
      assertSame(
        run(
          'var result = Array.prototype.slice.call({0: "a", 1: "b", length: 2}, 1); ' +
            'result.length + ":" + result[0];',
        ),
        '1:b',
      );
    },
  },
  {
    name: 'Array indexOf and lastIndexOf use strict equality and skip holes',
    run() {
      assertSame(run('[1, 2, 1].indexOf(1);'), 0);
      assertSame(run('[1, 2, 1].lastIndexOf(1);'), 2);
      assertSame(run('[NaN].indexOf(NaN);'), -1);
      assertSame(run('Array(2).indexOf(undefined);'), -1);
      assertSame(run('[0, 1, 2, 1].indexOf(1, -2);'), 3);
      assertSame(run('[0, 1, 2, 1].lastIndexOf(1, -2);'), 1);
      assertSame(
        run('Array.prototype.indexOf.call({0: "x", length: 1}, "x");'),
        0,
      );
      // ES5.1 15.4.4.14 step 5 computes `k` via ToInteger, which leaves -0
      // unchanged (9.4 step 2), and the loop's found index (step 8's `k`)
      // is always a non-negative mathematical integer starting from that
      // `k`; indexOf/lastIndexOf must never surface a found index as -0.
      assertSame(run('[17].indexOf(17, -0);'), 0);
      assertSame(Object.is(run('[17].indexOf(17, -0);'), -0), false);
      assertSame(run('[17].lastIndexOf(17, -0);'), 0);
      assertSame(Object.is(run('[17].lastIndexOf(17, -0);'), -0), false);

      // Deliberate ES2015-aligned deviation from ES5.1's literal −0 return:
      // ES5.1 §15.4.4.14/§15.4.4.15 compute the start index with ToInteger
      // (§9.4), and ToInteger(-0) is -0, so the spec says indexOf/lastIndexOf
      // return that -0 index unchanged (observable as 1/result === -Infinity).
      // ES2015 §22.1.3.12/§22.1.3.14 normalise the returned index to +0.
      // This engine follows the ES2015 result because the selected upstream
      // test indexOf-never-returns-negative-zero.js requires it.
      assertSame(run('1/[true].indexOf(true, -0);'), Infinity);
      assertSame(run('[true].indexOf(true, -0);'), 0);
      assertSame(run('[0, true].lastIndexOf(true, -0);'), -1);
      assertSame(run('1/[true, 0].lastIndexOf(true, -0);'), Infinity);
    },
  },
  {
    name: 'Array every, some, and forEach skip holes and pass callback arguments in order',
    run() {
      assertSame(
        run(
          'var trace = ""; var a = Array(3); a[1] = 2; ' +
            'var result = a.every(function (value, index, array) { ' +
            'trace = trace + value + index + (array === a); return value === 2; }); ' +
            'result + ":" + trace;',
        ),
        'true:21true',
      );
      assertSame(
        run(
          'var calls = 0; var result = [1, 2, 3].some(function (value) { ' +
            'calls = calls + 1; return value === 2; }); result + ":" + calls;',
        ),
        'true:2',
      );
      assertSame(
        run(
          'var a = [1, 2, 3]; var trace = ""; a.forEach(function (value, index) { ' +
            'trace = trace + value + index; if (index === 0) { delete a[1]; a[2] = 4; } }); trace;',
        ),
        '1042',
      );
      assertSame(
        run(
          'var name; try { [1].every(1); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Array map and filter preserve callback side effects and hole semantics',
    run() {
      assertSame(
        run(
          'var a = Array(3); a[1] = 2; var mapped = a.map(function (value) { return value * 3; }); ' +
            'mapped.length + ":" + mapped.hasOwnProperty("0") + ":" + mapped[1] + ":" + ' +
            'mapped.hasOwnProperty("2");',
        ),
        '3:false:6:false',
      );
      assertSame(
        run(
          'var filtered = [1, 2, 3, 4].filter(function (value, index) { return value % 2 === 0 && index > 0; }); ' +
            'filtered.length + ":" + filtered[0] + ":" + filtered[1];',
        ),
        '2:2:4',
      );
      assertSame(
        run(
          'var value; try { [1].map(function () { throw "stop"; }); } ' +
            'catch (error) { value = error; } value;',
        ),
        'stop',
      );
    },
  },
  {
    name: 'Array reduce and reduceRight select initial accumulators and skip holes',
    run() {
      assertSame(
        run('[1, 2, 3].reduce(function (a, b) { return a + b; });'),
        6,
      );
      assertSame(
        run('[1, 2, 3].reduceRight(function (a, b) { return a - b; });'),
        0,
      );
      assertSame(
        run(
          'var a = Array(4); a[2] = 5; a.reduce(function (accumulator, value) { return accumulator + value; }, 1);',
        ),
        6,
      );
      assertSame(
        run(
          'var name; try { Array(2).reduce(function (a, b) { return a + b; }); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var args = ""; [1, 2].reduce(function (accumulator, value, index, array) { ' +
            'args = accumulator + ":" + value + ":" + index + ":" + (array.length === 2); ' +
            'return accumulator + value; }, 0); args;',
        ),
        '1:2:1:true',
      );
    },
  },
];

export default tests;
