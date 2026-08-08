import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const result = evaluateScript(createRealm(), source);

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return result.value;
}

const tests = [
  {
    name: 'own property keys list array indices ascending before other keys, in creation order',
    run() {
      assertSame(
        run(
          "var o = {}; o.p1 = 'a'; o.p2 = 'b'; o[2] = 'c'; o[0] = 'd'; o[1] = 'e'; " +
            'Object.keys(o).join(",");',
        ),
        '0,1,2,p1,p2',
      );
    },
  },
  {
    name: 'function declarations and named expressions get a name property; anonymous expressions get ""',
    run() {
      assertSame(run('function f() {} f.name;'), 'f');
      assertSame(run('(function g() {}).name;'), 'g');
      assertSame(run('(function () {}).name;'), '');
    },
  },
  {
    name: 'name and length are configurable but not writable or enumerable',
    run() {
      assertSame(
        run(
          'function f(a, b) {} var d = Object.getOwnPropertyDescriptor(f, "name"); ' +
            'd.writable + "," + d.enumerable + "," + d.configurable;',
        ),
        'false,false,true',
      );
      assertSame(
        run(
          'function f(a, b) {} var d = Object.getOwnPropertyDescriptor(f, "length"); ' +
            'd.value + "," + d.writable + "," + d.enumerable + "," + d.configurable;',
        ),
        '2,false,false,true',
      );
    },
  },
  {
    name: 'the dynamic Function constructor names its function "anonymous"',
    run() {
      assertSame(run('(new Function("return 1;")).name;'), 'anonymous');
    },
  },
  {
    name: 'NamedEvaluation infers a name for an anonymous function assigned to a variable',
    run() {
      assertSame(run('var f = function () {}; f.name;'), 'f');
      assertSame(run('var g = function named() {}; g.name;'), 'named');
    },
  },
  {
    name: 'NamedEvaluation infers a name for an anonymous function in a simple assignment',
    run() {
      assertSame(run('var f; f = function () {}; f.name;'), 'f');
      assertSame(run('f = function () {}; f.name;'), 'f');
      assertSame(
        run('var target; function assignIt() { target = function () {}; } assignIt(); target.name;'),
        'target',
      );
    },
  },
  {
    name: 'NamedEvaluation infers a name for an anonymous function used as an object literal property value',
    run() {
      assertSame(run('({foo: function () {}}).foo.name;'), 'foo');
      assertSame(run('({foo: function named() {}}).foo.name;'), 'named');
      assertSame(run('var o = {1: function () {}}; o[1].name;'), '1');
    },
  },
  {
    name: 'bound functions are named "bound " followed by the target function\'s name',
    run() {
      assertSame(run('function f() {} f.bind(null).name;'), 'bound f');
      assertSame(run('(function () {}).bind(null).name;'), 'bound ');
      assertSame(run('Function.prototype.bind.name;'), 'bind');
    },
  },
  {
    name: 'object literal accessor methods are named "get "/"set " + the key and are not constructors',
    run() {
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor({get x() { return 1; }}, "x"); d.get.name;',
        ),
        'get x',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor({set x(v) {}}, "x"); d.set.name;',
        ),
        'set x',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor({get x() { return 1; }}, "x"); ' +
            'var threw = false; try { new d.get(); } catch (e) { threw = e.name === "TypeError"; } threw;',
        ),
        true,
      );
    },
  },
];

export default tests;
