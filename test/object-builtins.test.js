import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { toObject } from '../src/runtime/conversion.js';

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
      // Boolean.prototype.toString (ES5 15.6.4.2) returns "true"/"false" and
      // shadows the inherited Object.prototype.toString class-tag method, so
      // the boxing check for Boolean goes through the generic method
      // explicitly instead of `.toString()`.
      assertSame(
        run('Object.prototype.toString.call(Object(true));'),
        '[object Boolean]',
      );
      assertSame(run('Object(true).toString();'), 'true');
      assertSame(
        run('var text = Object("ab"); text.length + ":" + text[1];'),
        '2:b',
      );
    },
  },
  {
    name: 'boxed strings preserve indexed descriptors and own-key order',
    run() {
      const realm = createRealm();
      const boxed = toObject(realm, 'ab');
      const first =
        /** @type {import('../src/runtime/descriptors.js').CompletePropertyDescriptor} */ (
          boxed.getOwnProperty('0')
        );

      assertSame(first.value, 'a');
      assertSame(first.writable, false);
      assertSame(first.enumerable, true);
      assertSame(first.configurable, false);
      assertSame(boxed.hasProperty('1'), true);
      assertSame(boxed.hasProperty('2'), false);
      assertSame(boxed.hasProperty('01'), false);
      assertSame(boxed.delete('0'), false);
      assertSame(boxed.defineOwnProperty('0', { value: 'a' }), true);
      assertSame(boxed.defineOwnProperty('0', { value: 'z' }), false);
      boxed.defineOwnProperty('extra', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(
        JSON.stringify(boxed.ownPropertyKeys()),
        '["0","1","length","extra"]',
      );
    },
  },
  {
    name: 'large boxed strings do not materialize per-character descriptors',
    run() {
      const realm = createRealm();
      const boxed = toObject(realm, 'x'.repeat(100000));

      assertSame(boxed._properties.size, 1);
      assertSame(boxed.get('99999'), 'x');
      assertSame(boxed._properties.size, 1);
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
  {
    name: 'Object descriptor APIs define and report data and accessor properties',
    run() {
      assertSame(
        run(
          'var o = {}; var returned = Object.defineProperty(o, "x", {value: 3}); ' +
            'var d = Object.getOwnPropertyDescriptor(o, "x"); ' +
            '(returned === o) && d.value === 3 && d.writable === false && ' +
            'd.enumerable === false && d.configurable === false;',
        ),
        true,
      );
      assertSame(
        run(
          'var o = {}; var stored = 1; ' +
            'Object.defineProperty(o, "x", {' +
            'get: function () { return stored; }, ' +
            'set: function (value) { stored = value; }, ' +
            'enumerable: true, configurable: true}); ' +
            'o.x = 7; var d = Object.getOwnPropertyDescriptor(o, "x"); ' +
            'o.x === 7 && typeof d.get === "function" && typeof d.set === "function";',
        ),
        true,
      );
      assertSame(
        run('Object.getOwnPropertyDescriptor({}, "missing");'),
        undefined,
      );
    },
  },
  {
    name: 'Object descriptor APIs enforce invariants and convert all definitions before mutation',
    run() {
      assertSame(
        run(
          'var o = {}; Object.defineProperty(o, "x", {value: 1}); var name; ' +
            'try { Object.defineProperty(o, "x", {value: 2}); } ' +
            'catch (error) { name = error.name; } name + ":" + o.x;',
        ),
        'TypeError:1',
      );
      assertSame(
        run(
          'var target = {}; var trace = ""; var definitions = {' +
            'get first() { trace = trace + "a"; return {value: 1}; },' +
            'get second() { trace = trace + "b"; return {get: 1}; }' +
            '}; var name; try { Object.defineProperties(target, definitions); } ' +
            'catch (error) { name = error.name; } ' +
            'trace + ":" + name + ":" + target.hasOwnProperty("first");',
        ),
        'ab:TypeError:false',
      );
      assertSame(
        run(
          'var target = {}; Object.defineProperties(target, {' +
            'a: {value: 1, enumerable: true}, b: {value: 2, writable: true}' +
            '}); target.a + target.b;',
        ),
        3,
      );
    },
  },
  {
    name: 'Object prototype and creation APIs preserve requested prototype identity',
    run() {
      assertSame(
        run(
          'var proto = {answer: 42}; var o = Object.create(proto); ' +
            'Object.getPrototypeOf(o) === proto && o.answer === 42;',
        ),
        true,
      );
      assertSame(
        run(
          'var o = Object.create(null, {x: {value: 5, enumerable: true}}); ' +
            'Object.getPrototypeOf(o) === null && o.x === 5;',
        ),
        true,
      );
      assertSame(
        run(
          'var name; try { Object.create(1); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Object own-name enumeration distinguishes enumerable properties',
    run() {
      assertSame(
        run(
          'var o = {first: 1}; Object.defineProperty(o, "hidden", {value: 2}); ' +
            'o.last = 3; var names = Object.getOwnPropertyNames(o); ' +
            'names.length + ":" + names[0] + ":" + names[1] + ":" + names[2];',
        ),
        '3:first:hidden:last',
      );
      assertSame(
        run(
          'var o = {first: 1}; Object.defineProperty(o, "hidden", {value: 2}); ' +
            'o.last = 3; var names = Object.keys(o); ' +
            'names.length + ":" + names[0] + ":" + names[1];',
        ),
        '2:first:last',
      );
    },
  },
  {
    name: 'Object extensibility, sealing, and freezing update every descriptor',
    run() {
      assertSame(
        run(
          'var o = {}; var returned = Object.preventExtensions(o); ' +
            '(returned === o) && !Object.isExtensible(o);',
        ),
        true,
      );
      assertSame(
        run(
          'var o = {}; Object.preventExtensions(o); var name; ' +
            'try { Object.defineProperty(o, "x", {value: 1}); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var o = {x: 1}; var returned = Object.seal(o); var d = ' +
            'Object.getOwnPropertyDescriptor(o, "x"); ' +
            '(returned === o) && Object.isSealed(o) && !Object.isFrozen(o) && ' +
            'd.writable && !d.configurable;',
        ),
        true,
      );
      assertSame(
        run(
          'var o = {x: 1}; var returned = Object.freeze(o); var d = ' +
            'Object.getOwnPropertyDescriptor(o, "x"); ' +
            '(returned === o) && Object.isSealed(o) && Object.isFrozen(o) && ' +
            '!d.writable && !d.configurable;',
        ),
        true,
      );
      assertSame(run('Object.isSealed({});'), false);
      assertSame(run('Object.isFrozen({});'), false);
    },
  },
  {
    name: 'Object reflection APIs reject primitive targets with guest TypeErrors',
    run() {
      assertSame(run('typeof Object.keys;'), 'function');
      assertSame(
        run(
          'var name; try { Object.keys(1); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Object.freeze(null); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
];

export default tests;
