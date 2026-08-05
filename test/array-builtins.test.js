import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineArray } from '../src/runtime/array-object.js';
import { EngineObject } from '../src/runtime/object.js';

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
];

export default tests;
