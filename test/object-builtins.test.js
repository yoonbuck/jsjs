import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
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
    name: 'Object is installed and call or construction creates ordinary objects',
    run() {
      const realm = createRealm();

      assertSame(evaluateScript(realm, 'typeof Object;').value, 'function');
      evaluateScript(
        realm,
        'var called = Object(); var constructed = new Object(null);',
      );

      const called = realm.globalObject.get('called');
      const constructed = realm.globalObject.get('constructed');

      assertSame(called instanceof EngineObject, true);
      assertSame(constructed instanceof EngineObject, true);
      assertSame(
        /** @type {EngineObject} */ (called).getPrototype(),
        realm.intrinsics.objectPrototype,
      );
      assertSame(
        /** @type {EngineObject} */ (constructed).getPrototype(),
        realm.intrinsics.objectPrototype,
      );
    },
  },
  {
    name: 'Object preserves objects and boxes primitive values',
    run() {
      assertSame(run('var o = {}; Object(o) === o;'), true);
      assertSame(run('var o = {}; new Object(o) === o;'), true);
      assertSame(run('Object(1).toString();'), '[object Number]');
      assertSame(run('Object("x").toString();'), '[object String]');
      assertSame(run('Object(true).toString();'), '[object Boolean]');
      assertSame(
        run('var text = Object("ab"); text.length + ":" + text[1];'),
        '2:b',
      );
    },
  },
  {
    name: 'Object prototype identity and ownership methods use guest descriptors',
    run() {
      assertSame(run('({}).constructor === Object;'), true);
      assertSame(run('({}).toString();'), '[object Object]');
      assertSame(run('var o = {}; o.valueOf() === o;'), true);
      assertSame(
        run(
          'function Parent() {} Parent.prototype.shared = 1; ' +
            'var child = new Parent(); child.own = 2; ' +
            'child.hasOwnProperty("own") && !child.hasOwnProperty("shared");',
        ),
        true,
      );
      assertSame(
        run(
          'function Parent() {} var child = new Parent(); ' +
            'Parent.prototype.isPrototypeOf(child);',
        ),
        true,
      );
      assertSame(run('({}).isPrototypeOf(1);'), false);
      assertSame(
        run(
          'var o = {visible: 1}; ' +
            'o.propertyIsEnumerable("visible") && ' +
            '!o.propertyIsEnumerable("missing");',
        ),
        true,
      );
    },
  },
  {
    name: 'Object prototype toLocaleString delegates and incompatible calls throw guest TypeErrors',
    run() {
      assertSame(
        run(
          'var o = {value: "localized", toString: function () { return this.value; }}; ' +
            'o.toLocaleString();',
        ),
        'localized',
      );
      assertSame(
        run(
          'var name; try { ({toString: 1}).toLocaleString(); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var valueOf = Object.prototype.valueOf; var name; ' +
            'try { valueOf(); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Object prototype methods have ES5 property attributes',
    run() {
      const realm = createRealm();
      const objectConstructor = /** @type {EngineObject} */ (
        realm.globalObject.get('Object')
      );
      const objectPrototype = realm.intrinsics.objectPrototype;
      const constructor = objectPrototype.getOwnProperty('constructor');
      const hasOwnProperty = /** @type {EngineObject} */ (
        objectPrototype.get('hasOwnProperty')
      );

      assertSame(objectConstructor.get('prototype'), objectPrototype);
      assertSame(constructor?.value, objectConstructor);
      assertSame(constructor?.writable, true);
      assertSame(constructor?.enumerable, false);
      assertSame(constructor?.configurable, true);
      assertSame(hasOwnProperty.get('length'), 1);
      assertSame(
        objectPrototype.getOwnProperty('hasOwnProperty')?.enumerable,
        false,
      );
    },
  },
];

export default tests;
