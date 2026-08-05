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
];

export default tests;
