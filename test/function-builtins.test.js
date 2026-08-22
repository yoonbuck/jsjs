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
        realm.intrinsics.functionPrototype.getPrototypeOf(),
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
    name: 'Function prototype owns realm-local restricted caller and arguments accessors',
    run() {
      const realm = createRealm();
      const functionPrototype = realm.intrinsics.functionPrototype;
      const thrower = realm.intrinsics.throwTypeErrorFunction;
      const caller = functionPrototype.getOwnProperty('caller');
      const argumentsDescriptor = functionPrototype.getOwnProperty('arguments');

      assertSame(caller === undefined, false, 'caller descriptor must exist');
      assertSame(
        argumentsDescriptor === undefined,
        false,
        'arguments descriptor must exist',
      );

      if (caller === undefined || argumentsDescriptor === undefined) {
        return;
      }

      for (const descriptor of [caller, argumentsDescriptor]) {
        assertSame(descriptor.enumerable, false);
        assertSame(descriptor.configurable, true);
        assertSame(descriptor.get, thrower);
        assertSame(descriptor.set, thrower);
        assertSame(
          Object.prototype.hasOwnProperty.call(descriptor, 'value'),
          false,
        );
      }

      assertSame(caller.get, argumentsDescriptor.get);
      assertSame(caller.set, argumentsDescriptor.set);

      const otherRealm = createRealm();
      const otherCaller =
        otherRealm.intrinsics.functionPrototype.getOwnProperty('caller');

      assertSame(otherCaller === undefined, false);

      if (otherCaller !== undefined) {
        assertSame(caller.get === otherCaller.get, false);
      }
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
      assertSame(
        run(
          'function count() { return arguments.length; }' +
            'count.apply(null, {length: -1});',
        ),
        0,
      );
      assertSame(
        run(
          'function list() { return arguments.length + ":" + arguments[0]; }' +
            'list.apply(null, {0: "x", length: 1.9});',
        ),
        '1:x',
      );
      assertSame(
        run(
          'var coercions = 0;' +
            'var length = {valueOf: function () { coercions += 1; return 1; }};' +
            'function count() { return arguments.length; }' +
            'count.apply(null, {0: "x", length: length}) + ":" + coercions;',
        ),
        '1:1',
      );
      assertSame(
        run(
          'var called = 0;' +
            'var list = {length: 4294967296};' +
            'Object.defineProperty(list, "0", {' +
            'get: function () { throw "index-zero"; }' +
            '});' +
            'function target() { called += 1; }' +
            'var caught;' +
            'try { target.apply(null, list); } catch (error) { caught = error; }' +
            'caught + ":" + called;',
        ),
        'index-zero:0',
      );
      assertSame(
        run(
          'var touched = 0;' +
            'var list = {get length() { touched += 1; throw "length"; }};' +
            'var caught;' +
            'try { Function.prototype.apply.call({}, null, list); }' +
            'catch (error) { caught = error.name; }' +
            'caught + ":" + touched;',
        ),
        'TypeError:0',
      );
      assertSame(
        run(
          'var log = [];' +
            'var list = {};' +
            'Object.defineProperty(list, "length", {' +
            'get: function () { log.push("length"); return 2; }' +
            '});' +
            'Object.defineProperty(list, "0", {' +
            'get: function () { log.push("0"); return "a"; }' +
            '});' +
            'Object.defineProperty(list, "1", {' +
            'get: function () { log.push("1"); return "b"; }' +
            '});' +
            'function target() { log.push("call"); }' +
            'target.apply(null, list);' +
            'log.join(",");',
        ),
        'length,0,1,call',
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
    name: 'ordinary class and rebound functions retain bound metadata and behavior',
    run() {
      assertSame(
        run(`
          function ordinary(a, b) {
            return this.base + a + b;
          }
          var ordinaryBound = ordinary.bind({ base: 1 }, 2);
          var rebound = ordinaryBound.bind(null, 3);
          class Pair {
            constructor(a, b) {
              this.total = a + b;
            }
          }
          var BoundPair = Pair.bind(null, 4);
          var pair = new BoundPair(5);
          var classCallError;
          try {
            BoundPair(5);
          } catch (error) {
            classCallError = error.name;
          }
          [
            Object.getPrototypeOf(ordinaryBound) ===
              Object.getPrototypeOf(ordinary),
            ordinaryBound.name,
            ordinaryBound.length,
            ordinaryBound(3),
            Object.getPrototypeOf(rebound) ===
              Object.getPrototypeOf(ordinaryBound),
            rebound.name,
            rebound.length,
            rebound(),
            Object.getPrototypeOf(BoundPair) === Object.getPrototypeOf(Pair),
            BoundPair.name,
            BoundPair.length,
            pair.total,
            pair instanceof Pair,
            pair instanceof BoundPair,
            classCallError
          ].join(':');
        `),
        'true:bound ordinary:1:6:true:bound bound ordinary:0:6:true:bound Pair:1:9:true:true:TypeError',
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
