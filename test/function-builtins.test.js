import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

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
    name: 'Function and its callable prototype are installed with realm-local wiring',
    run() {
      const realm = createRealm();

      assertSame(evaluateScript(realm, 'typeof Function;').value, 'function');
      assertSame(
        evaluateScript(realm, 'typeof Function.prototype;').value,
        'function',
      );
      assertSame(
        evaluateScript(realm, 'Function.prototype();').value,
        undefined,
      );
      assertSame(
        evaluateScript(realm, 'Function.prototype.constructor === Function;')
          .value,
        true,
      );
      assertSame(
        realm.intrinsics.functionPrototype.getPrototype(),
        realm.intrinsics.objectPrototype,
      );
      assertSame(
        /** @type {EngineObject} */ (realm.globalObject.get('Function')).get(
          'prototype',
        ),
        realm.intrinsics.functionPrototype,
      );
    },
  },
  {
    name: 'dynamic Function construction compiles and runs guest source',
    run() {
      assertSame(run('Function("return 1;")();'), 1);
      assertSame(run('new Function("a", "b", "return a + b;")(2, 3);'), 5);
      assertSame(run('typeof new Function("return 1;");'), 'function');
    },
  },
  {
    name: 'Function prototype call forwards receivers and arguments',
    run() {
      assertSame(
        run(
          'function add(a, b) { return this.base + a + b; } ' +
            'add.call({base: 1}, 2, 3);',
        ),
        6,
      );
      assertSame(
        run(
          'var base = 7; function read() { return this.base; } read.call(null);',
        ),
        7,
      );
      assertSame(
        run(
          'function strictThis() { "use strict"; return this; } strictThis.call(5);',
        ),
        5,
      );
      assertSame(
        run('function boxedThis() { return typeof this; } boxedThis.call(5);'),
        'object',
      );
    },
  },
  {
    name: 'Function prototype apply consumes array-like objects and nullish lists',
    run() {
      assertSame(
        run(
          'function join(a, b, c) { return this.prefix + a + b + c; } ' +
            'join.apply({prefix: ">"}, ["a", "b", "c"]);',
        ),
        '>abc',
      );
      assertSame(
        run(
          'function pair(a, b) { return a + ":" + b; } ' +
            'pair.apply(null, {0: "x", 1: "y", length: 2});',
        ),
        'x:y',
      );
      assertSame(
        run(
          'function count() { return arguments.length; } ' +
            'count.apply(null, null) + count.apply(null);',
        ),
        0,
      );
      assertSame(
        run(
          'function f() {} var name; try { f.apply(null, 1); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Function prototype bind captures this, arguments, and adjusted length',
    run() {
      assertSame(
        run(
          'function add(a, b, c) { return this.base + a + b + c; } ' +
            'var bound = add.bind({base: 1}, 2); ' +
            'bound.length + ":" + bound(3, 4);',
        ),
        '2:10',
      );
      assertSame(
        run(
          'function read() { return this.value; } ' +
            'var first = read.bind({value: 1}); ' +
            'var second = first.bind({value: 2}); second();',
        ),
        1,
      );
      assertSame(
        run(
          'function f() {} var bound = f.bind(null); ' +
            '!bound.hasOwnProperty("prototype");',
        ),
        true,
      );
    },
  },
  {
    name: 'bound constructors ignore bound this and delegate construction and instanceof',
    run() {
      assertSame(
        run(
          'function Point(x, y) { this.x = x; this.y = y; } ' +
            'var ignored = {x: 9}; var Bound = Point.bind(ignored, 2); ' +
            'var point = new Bound(3); ' +
            'point.x + ":" + point.y + ":" + (point instanceof Point) + ":" + ' +
            '(point instanceof Bound) + ":" + ignored.x;',
        ),
        '2:3:true:true:9',
      );
      assertSame(
        run(
          'var bound = Object.keys.bind(null); var name; ' +
            'try { new bound(); } catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Function prototype methods reject incompatible receivers and propagate throws',
    run() {
      assertSame(
        run(
          'var name; try { Function.prototype.call.call({}, null); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'function fail() { throw "sentinel"; } var value; ' +
            'try { fail.apply(null, []); } catch (error) { value = error; } value;',
        ),
        'sentinel',
      );
      assertSame(
        run(
          'function f() {} typeof f.toString() + ":" + typeof Object.keys.toString();',
        ),
        'string:string',
      );
    },
  },
];

export default tests;
