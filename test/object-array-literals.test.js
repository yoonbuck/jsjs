import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const realm = createRealm();
  return evaluateScript(realm, source).value;
}

/**
 * Evaluates `source` in a fresh realm and returns both the realm and the
 * named global, so a test can keep evaluating guest code against the same
 * object after inspecting or reconfiguring it through the object protocol.
 *
 * @param {string} source
 * @param {string} name
 * @returns {{ realm: any, value: any, evaluate: (source: string) => any }}
 */
function globalOfRealm(source, name) {
  const realm = createRealm();
  evaluateScript(realm, source);

  return {
    realm,
    value: realm.globalObject.get(name),
    evaluate: (nextSource) => evaluateScript(realm, nextSource).value,
  };
}

/**
 * @param {string} source
 * @param {string} name
 * @returns {any}
 */
function ownPropertyOfGlobal(source, name) {
  return globalOfRealm(source, name).value;
}

/**
 * @param {unknown} value
 * @param {Partial<{ writable: boolean, enumerable: boolean, configurable: boolean }>} [overrides={}]
 * @returns {any}
 */
function dataDescriptor(value, overrides = {}) {
  return {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
    ...overrides,
  };
}

const tests = [
  {
    name: 'object literals create objects with their data properties',
    run() {
      assertSame(run('var o = {a: 1, b: "x"}; o.a;'), 1);
      assertSame(run('var o = {a: 1, b: "x"}; o.b;'), 'x');
      assertSame(run('var o = {}; typeof o;'), 'object');
    },
  },
  {
    name: 'object literal properties are writable, enumerable, and configurable',
    run() {
      const o = ownPropertyOfGlobal('var o = {a: 1};', 'o');
      const descriptor = o.getOwnProperty('a');

      assertSame(descriptor.value, 1);
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'object literals inherit from the realm intrinsic object prototype',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var o = {};');

      const o = /** @type {any} */ (realm.globalObject.get('o'));
      assertSame(o.getPrototype(), realm.intrinsics.objectPrototype);
    },
  },
  {
    name: 'string and numeric literal keys become string property keys',
    run() {
      assertSame(run('var o = {"a b": 1, 3: 2}; o["a b"] + o[3];'), 3);
      assertSame(run('var o = {1: "one"}; o["1"];'), 'one');
      assertSame(run('var o = {"1": "one"}; o[1];'), 'one');
    },
  },
  {
    name: 'computed member access converts the key with ToString',
    run() {
      assertSame(run('var o = {"true": 1}; o[true];'), 1);
      assertSame(run('var o = {"undefined": 1}; var u; o[u];'), 1);
      assertSame(run('var o = {a: 1}; var k = "a"; o[k];'), 1);
    },
  },
  {
    name: 'a duplicate data key keeps the last definition',
    run() {
      assertSame(run('var o = {a: 1, a: 2}; o.a;'), 2);
    },
  },
  {
    name: 'member expressions chain through nested object literals',
    run() {
      assertSame(run('var o = {a: {b: {c: 5}}}; o.a.b.c;'), 5);
      assertSame(run('var o = {a: {b: 1}}; o["a"]["b"];'), 1);
    },
  },
  {
    name: 'reading a missing property produces undefined and walks the prototype chain',
    run() {
      assertSame(run('var o = {}; typeof o.missing;'), 'undefined');

      const realm = createRealm();
      evaluateScript(realm, 'var o = {};');
      realm.intrinsics.objectPrototype.defineOwnProperty('inherited', {
        value: 42,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      assertSame(evaluateScript(realm, 'o.inherited;').value, 42);
    },
  },
  {
    name: 'property assignment creates and updates own properties',
    run() {
      assertSame(run('var o = {}; o.a = 1; o["b"] = 2; o.a + o.b;'), 3);
      assertSame(run('var o = {a: 1}; o.a = 2; o.a;'), 2);
      assertSame(run('var o = {}; o.a = 1;'), 1);

      const o = ownPropertyOfGlobal('var o = {}; o.a = 1;', 'o');
      const descriptor = o.getOwnProperty('a');
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'getter properties run their function on read',
    run() {
      assertSame(run('var o = {get a() { return 7; }}; o.a;'), 7);
      assertSame(
        run(
          'var count = 0; var o = {get a() { count = count + 1; return count; }}; o.a; o.a;',
        ),
        2,
      );
    },
  },
  {
    name: 'a getter receives the object it was read from as this',
    run() {
      assertSame(
        run('var o = {v: 3, get double() { return this.v * 2; }}; o.double;'),
        6,
      );
    },
  },
  {
    name: 'setter properties run their function on assignment',
    run() {
      assertSame(
        run(
          'var seen; var o = {set a(value) { seen = value; }}; o.a = 5; seen;',
        ),
        5,
      );
      assertSame(
        run(
          'var o = {v: 0, set a(value) { this.v = value * 2; }}; o.a = 4; o.v;',
        ),
        8,
      );
    },
  },
  {
    name: 'a getter and setter can be defined for the same key',
    run() {
      assertSame(
        run(
          'var o = {stored: 1, get a() { return this.stored; }, set a(value) { this.stored = value; }}; o.a = 9; o.a;',
        ),
        9,
      );

      const o = ownPropertyOfGlobal(
        'var o = {get a() { return 1; }, set a(value) {}};',
        'o',
      );
      const descriptor = o.getOwnProperty('a');
      assertSame(typeof descriptor.get, 'object');
      assertSame(typeof descriptor.set, 'object');
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'assigning to a getter-only property is silently ignored in non-strict code',
    run() {
      assertSame(run('var o = {get a() { return 1; }}; o.a = 5; o.a;'), 1);
    },
  },
  {
    name: 'object literal property values are evaluated in source order',
    run() {
      assertSame(
        run(
          'var order = ""; var o = {a: (order = order + "a"), b: (order = order + "b")}; order;',
        ),
        'ab',
      );
    },
  },
  {
    name: 'array literals create indexed elements and a matching length',
    run() {
      assertSame(run('var a = [1, 2, 3]; a.length;'), 3);
      assertSame(run('var a = [1, 2, 3]; a[0];'), 1);
      assertSame(run('var a = [1, 2, 3]; a[2];'), 3);
      assertSame(run('var a = []; a.length;'), 0);
      assertSame(run('typeof [];'), 'object');
    },
  },
  {
    name: 'array literals inherit from the realm intrinsic array prototype',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var a = [];');

      const a = /** @type {any} */ (realm.globalObject.get('a'));
      assertSame(a.getPrototype(), realm.intrinsics.arrayPrototype);
      assertSame(
        realm.intrinsics.arrayPrototype.getPrototype(),
        realm.intrinsics.objectPrototype,
      );
    },
  },
  {
    name: 'array elements are writable, enumerable, configurable data properties',
    run() {
      const a = ownPropertyOfGlobal('var a = [7];', 'a');
      const element = a.getOwnProperty('0');

      assertSame(element.value, 7);
      assertSame(element.writable, true);
      assertSame(element.enumerable, true);
      assertSame(element.configurable, true);
    },
  },
  {
    name: 'array length is a writable, non-enumerable, non-configurable own property',
    run() {
      const a = ownPropertyOfGlobal('var a = [1];', 'a');
      const length = a.getOwnProperty('length');

      assertSame(length.value, 1);
      assertSame(length.writable, true);
      assertSame(length.enumerable, false);
      assertSame(length.configurable, false);
    },
  },
  {
    name: 'elisions leave holes that count toward length but define no property',
    run() {
      assertSame(run('var a = [1, , 3]; a.length;'), 3);
      assertSame(run('var a = [1, , 3]; typeof a[1];'), 'undefined');

      const a = ownPropertyOfGlobal('var a = [1, , 3];', 'a');
      assertSame(a.getOwnProperty('1'), undefined);
      assertSame(a.getOwnProperty('0').value, 1);
      assertSame(a.getOwnProperty('2').value, 3);
    },
  },
  {
    name: 'trailing elisions extend length while a trailing comma does not',
    run() {
      assertSame(run('var a = [1, , ]; a.length;'), 2);
      assertSame(run('var a = [ , ]; a.length;'), 1);
      assertSame(run('var a = [1, 2, ]; a.length;'), 2);
      assertSame(run('var a = [ , , ]; a.length;'), 2);
    },
  },
  {
    name: 'array elements are evaluated left to right',
    run() {
      assertSame(
        run(
          'var order = ""; function note(value) { order = order + value; return value; } ' +
            'var a = [note("a"), note("b")]; order;',
        ),
        'ab',
      );
    },
  },
  {
    name: 'assigning an index at or beyond length grows length',
    run() {
      assertSame(run('var a = []; a[0] = 1; a.length;'), 1);
      assertSame(run('var a = []; a[3] = 1; a.length;'), 4);
      assertSame(run('var a = [1]; a[0] = 2; a.length;'), 1);
      assertSame(run('var a = []; a[3] = 1; typeof a[1];'), 'undefined');
    },
  },
  {
    name: 'shrinking length deletes the elements above the new length',
    run() {
      assertSame(run('var a = [1, 2, 3]; a.length = 1; a.length;'), 1);
      assertSame(
        run('var a = [1, 2, 3]; a.length = 1; typeof a[1];'),
        'undefined',
      );

      const a = ownPropertyOfGlobal('var a = [1, 2, 3]; a.length = 1;', 'a');
      assertSame(a.getOwnProperty('1'), undefined);
      assertSame(a.getOwnProperty('2'), undefined);
      assertSame(a.getOwnProperty('0').value, 1);
    },
  },
  {
    name: 'growing length adds no elements',
    run() {
      assertSame(run('var a = [1]; a.length = 3; a.length;'), 3);

      const a = ownPropertyOfGlobal('var a = [1]; a.length = 3;', 'a');
      assertSame(a.getOwnProperty('2'), undefined);
    },
  },
  {
    name: 'a non-writable length rejects length changes and elements beyond it',
    run() {
      const array = globalOfRealm('var a = [1, 2, 3];', 'a');
      array.value.defineOwnProperty('length', { writable: false });

      assertSame(array.evaluate('a.length = 1; a.length;'), 3);
      assertSame(array.evaluate('a.length = 9; a.length;'), 3);
      assertSame(array.evaluate('a[5] = 6; a.length;'), 3);
      assertSame(array.evaluate('typeof a[5];'), 'undefined');
      assertSame(array.evaluate('a[0] = 9; a[0];'), 9);

      assertSame(array.value.defineOwnProperty('length', { value: 1 }), false);
      const lengthError = assertThrows(
        () => array.value.defineOwnProperty('length', { value: 1 }, true),
        GuestErrorSignal,
      );
      assertSame(
        lengthError.message,
        'Cannot change the length of a non-writable array length',
      );

      assertSame(array.value.defineOwnProperty('5', dataDescriptor(6)), false);
      const indexError = assertThrows(
        () => array.value.defineOwnProperty('5', dataDescriptor(6), true),
        GuestErrorSignal,
      );
      assertSame(
        indexError.message,
        'Cannot add an element beyond a non-writable array length',
      );

      assertSame(array.value.getOwnProperty('5'), undefined);
      assertSame(array.value.getOwnProperty('length').value, 3);
    },
  },
  {
    name: 'a shrink that clears writable deletes the elements first and then re-locks length',
    run() {
      const a = ownPropertyOfGlobal('var a = [1, 2, 3];', 'a');

      assertSame(
        a.defineOwnProperty('length', { value: 1, writable: false }),
        true,
      );

      const length = a.getOwnProperty('length');
      assertSame(length.value, 1);
      assertSame(length.writable, false);
      assertSame(a.getOwnProperty('0').value, 1);
      assertSame(a.getOwnProperty('1'), undefined);
      assertSame(a.getOwnProperty('2'), undefined);

      assertSame(a.defineOwnProperty('length', { value: 0 }), false);
      assertSame(a.defineOwnProperty('1', dataDescriptor(2)), false);
      assertSame(a.getOwnProperty('length').value, 1);
    },
  },
  {
    name: 'a non-configurable element stops a shrink and leaves length just above it',
    run() {
      const a = ownPropertyOfGlobal('var a = [1, 2, 3];', 'a');
      a.defineOwnProperty('1', dataDescriptor(2, { configurable: false }));

      assertSame(a.defineOwnProperty('length', { value: 0 }), false);

      const length = a.getOwnProperty('length');
      assertSame(length.value, 2);
      assertSame(length.writable, true);
      assertSame(a.getOwnProperty('2'), undefined);
      assertSame(a.getOwnProperty('1').value, 2);
      assertSame(a.getOwnProperty('0').value, 1);

      const error = assertThrows(
        () => a.defineOwnProperty('length', { value: 0 }, true),
        GuestErrorSignal,
      );
      assertSame(
        error.message,
        'Cannot delete a non-configurable array element',
      );
      assertSame(a.getOwnProperty('length').value, 2);
      assertSame(a.getOwnProperty('0').value, 1);
    },
  },
  {
    name: 'a stopped shrink that clears writable locks length above the surviving element',
    run() {
      const a = ownPropertyOfGlobal('var a = [1, 2, 3];', 'a');
      a.defineOwnProperty('1', dataDescriptor(2, { configurable: false }));

      assertSame(
        a.defineOwnProperty('length', { value: 0, writable: false }),
        false,
      );

      const length = a.getOwnProperty('length');
      assertSame(length.value, 2);
      assertSame(length.writable, false);
      assertSame(a.getOwnProperty('1').value, 2);
      assertSame(a.getOwnProperty('2'), undefined);
    },
  },
  {
    name: 'an invalid length value throws a RangeError',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(realm, 'var a = []; a.length = -1;').type,
        'throw',
      );
      assertSame(
        evaluateScript(realm, 'var a = []; a.length = 1.5;').type,
        'throw',
      );
      assertSame(
        evaluateScript(realm, 'var a = []; a.length = "x";').type,
        'throw',
      );
      assertSame(run('var a = []; a.length = "2"; a.length;'), 2);
    },
  },
  {
    name: 'non-index properties do not affect array length',
    run() {
      assertSame(run('var a = []; a.x = 1; a.length;'), 0);
      assertSame(run('var a = []; a["01"] = 1; a.length;'), 0);
      assertSame(run('var a = []; a[-1] = 1; a.length;'), 0);
      assertSame(run('var a = []; a["4294967295"] = 1; a.length;'), 0);
      assertSame(run('var a = []; a.x = 1; a.x;'), 1);
    },
  },
  {
    name: 'arrays and objects nest inside each other',
    run() {
      assertSame(run('var a = [[1, 2], [3]]; a[0][1];'), 2);
      assertSame(run('var a = [{a: 1}]; a[0].a;'), 1);
      assertSame(run('var o = {list: [1, 2]}; o.list[1];'), 2);
      assertSame(run('var a = [[1, 2], [3]]; a[1].length;'), 1);
    },
  },
  {
    name: 'guest toString and valueOf methods drive primitive conversion',
    run() {
      assertSame(
        run('var o = {toString: function () { return "x"; }}; "" + o;'),
        'x',
      );
      assertSame(
        run('var o = {valueOf: function () { return 3; }}; o * 2;'),
        6,
      );
    },
  },
  {
    name: 'member access on null or undefined throws a TypeError',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, 'var o = null; o.a;').type, 'throw');
      assertSame(evaluateScript(realm, 'var o; o.a;').type, 'throw');
      assertSame(
        evaluateScript(realm, 'var o = null; o["a"] = 1;').type,
        'throw',
      );
    },
  },
  {
    name: 'member access on a primitive reports the missing ToObject operation explicitly',
    run() {
      const error = assertThrows(() => run('var n = 1; n.a;'), Error);
      assertSame(error.name, 'UnsupportedOperationError');
      assertSame(
        /** @type {any} */ (error).operation,
        'ToObject on a number value',
      );

      const stringError = assertThrows(
        () => run('var s = "a"; s.length;'),
        Error,
      );
      assertSame(stringError.name, 'UnsupportedOperationError');
    },
  },
];

export default tests;
