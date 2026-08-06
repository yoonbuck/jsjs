import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

const tests = [
  {
    name: 'String called as a function converts its argument with ToString and never boxes, distinguishing omitted from undefined',
    run() {
      assertSame(run('typeof String("x");'), 'string');
      assertSame(run('String();'), '');
      assertSame(run('String(undefined);'), 'undefined');
      assertSame(run('String(null);'), 'null');
      assertSame(run('String(true);'), 'true');
      assertSame(run('String(false);'), 'false');
      assertSame(run('String(0);'), '0');
      assertSame(run('String(-0);'), '0');
      assertSame(run('String(NaN);'), 'NaN');
      assertSame(run('String(Infinity);'), 'Infinity');
      assertSame(run('String(123);'), '123');
      assertSame(run('String([1, 2, 3]);'), '1,2,3');
      assertSame(
        run(
          'var order = ""; ' +
            'var value = { toString: function () { order += "t"; return "9"; }, ' +
            'valueOf: function () { order += "v"; return 5; } }; ' +
            'String(value) + ":" + order;',
        ),
        '9:t',
      );
    },
  },
  {
    name: 'new String boxes the ToString-converted primitive as a String object with boxed class/prototype/length/index descriptors',
    run() {
      assertSame(run('typeof new String("ab");'), 'object');
      assertSame(
        run('Object.prototype.toString.call(new String("ab"));'),
        '[object String]',
      );
      assertSame(run('new String("ab") instanceof String;'), true);
      assertSame(
        run('Object.getPrototypeOf(new String("ab")) === String.prototype;'),
        true,
      );
      assertSame(run('new String("ab").valueOf();'), 'ab');
      assertSame(run('new String().valueOf();'), '');
      assertSame(run('new String(5).valueOf();'), '5');
      assertSame(run('new String("ab").length;'), 2);
      assertSame(run('new String("ab")[0];'), 'a');
      assertSame(run('new String("ab")[1];'), 'b');
      assertSame(run('new String("ab") == "ab";'), true);
      assertSame(run('new String("ab") === "ab";'), false);
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(new String("ab"), "0"); ' +
            'd.value + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'a:false:true:false',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(new String("ab"), "length"); ' +
            'd.value + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        '2:false:false:false',
      );
    },
  },
  {
    name: 'String wrapper identity is realm-local',
    run() {
      const first = createRealm();
      const second = createRealm();

      evaluateScript(first, 'var boxed = new String("hi");');

      const boxed = first.globalObject.get('boxed');

      second.globalObject.defineOwnProperty('foreign', {
        value: boxed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(second, 'foreign instanceof String;').value,
        false,
      );
      assertSame(
        evaluateScript(second, 'String.prototype.valueOf.call(foreign);').value,
        'hi',
      );
      assertSame(
        evaluateScript(second, 'String.prototype.toString.call(foreign);')
          .value,
        'hi',
      );
    },
  },
  {
    name: 'String.fromCharCode with no arguments returns the empty string',
    run() {
      assertSame(run('String.fromCharCode();'), '');
    },
  },
  {
    name: 'String.fromCharCode reduces each argument with ToUint16: negative, out-of-range, fractional, NaN, and infinite values wrap or clamp to a 16-bit unsigned code unit',
    run() {
      assertSame(run('String.fromCharCode(65);'), 'A');
      assertSame(run('String.fromCharCode(-1);'), String.fromCharCode(65535));
      assertSame(run('String.fromCharCode(65536);'), String.fromCharCode(0));
      assertSame(run('String.fromCharCode(65537);'), String.fromCharCode(1));
      assertSame(run('String.fromCharCode(65.9);'), 'A');
      assertSame(run('String.fromCharCode(NaN);'), String.fromCharCode(0));
      assertSame(run('String.fromCharCode(Infinity);'), String.fromCharCode(0));
      assertSame(
        run('String.fromCharCode(-Infinity);'),
        String.fromCharCode(0),
      );
      assertSame(
        /** @type {string} */ (run('String.fromCharCode(0);')).charCodeAt(0),
        0,
      );
      assertSame(run('String.fromCharCode(-65536);'), String.fromCharCode(0));
    },
  },
  {
    name: 'String.fromCharCode coerces its arguments left-to-right and propagates the first coercion error by identity',
    run() {
      assertSame(
        run(
          'var order = ""; ' +
            'var a = { valueOf: function () { order += "a"; return 65; } }; ' +
            'var b = { valueOf: function () { order += "b"; return 66; } }; ' +
            'String.fromCharCode(a, b) + ":" + order;',
        ),
        'AB:ab',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var value = { valueOf: function () { order += "v"; return 67; }, ' +
            'toString: function () { order += "t"; return "68"; } }; ' +
            'String.fromCharCode(value) + ":" + order;',
        ),
        'C:v',
      );

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var order = ""; ' +
          'var a = { valueOf: function () { order += "a"; return 65; } }; ' +
          'var thrown = new Error("boom"); ' +
          'var bad = { valueOf: function () { order += "bad"; throw thrown; } }; ' +
          'var b = { valueOf: function () { order += "b"; return 66; } }; ' +
          'var caught; ' +
          'try { String.fromCharCode(a, bad, b); } catch (error) { caught = error; } ' +
          '(caught === thrown) + ":" + order;',
      );

      assertSame(completion.value, 'true:abad');
    },
  },
  {
    name: 'String.fromCharCode produces code units, not code points: isolated surrogates and NUL round-trip through charCodeAt',
    run() {
      assertSame(run('String.fromCharCode(0).charCodeAt(0);'), 0);
      assertSame(run('String.fromCharCode(0).length;'), 1);
      assertSame(run('String.fromCharCode(0xd800).charCodeAt(0);'), 0xd800);
      assertSame(run('String.fromCharCode(0xdc00).charCodeAt(0);'), 0xdc00);
      assertSame(run('String.fromCharCode(0xd800, 0xdc00).length;'), 2);
      assertSame(
        run('String.fromCharCode(0xd800, 0xdc00).charCodeAt(0);'),
        0xd800,
      );
      assertSame(
        run('String.fromCharCode(0xd800, 0xdc00).charCodeAt(1);'),
        0xdc00,
      );
    },
  },
  {
    name: 'String.fromCharCode carries ES5 length/name and a writable/non-enumerable/configurable descriptor',
    run() {
      assertSame(run('String.fromCharCode.length;'), 1);
      assertSame(run('String.fromCharCode.name;'), 'fromCharCode');
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(String, "fromCharCode"); ' +
            'd.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:false:true',
      );
    },
  },
  {
    name: 'String.prototype.toString and valueOf work on primitives, matching wrapper objects, and a foreign-realm wrapper, and reject incompatible receivers',
    run() {
      assertSame(run('"ab".toString();'), 'ab');
      assertSame(run('"ab".valueOf();'), 'ab');
      assertSame(run('(new String("ab")).toString();'), 'ab');
      assertSame(run('(new String("ab")).valueOf();'), 'ab');
      assertSame(run('String.prototype.toString();'), '');
      assertSame(run('String.prototype.valueOf();'), '');
      assertSame(run('String.prototype.toString.call(String.prototype);'), '');

      assertSame(
        run(
          'var name; try { String.prototype.toString.call(1); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.valueOf.call(true); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.toString.call({}); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.valueOf.call(undefined); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.toString.call(new Number(1)); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'String.prototype.toString.call(5);',
      );

      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {{ get: (key: string) => unknown }} */ (completion.value).get(
          'name',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'String.prototype.charAt is generic (RequireObjectCoercible + ToString) with ToInteger position, empty string out of range, and code-unit semantics for surrogate pairs',
    run() {
      assertSame(run('"abc".charAt(0);'), 'a');
      assertSame(run('"abc".charAt(2);'), 'c');
      assertSame(run('"abc".charAt();'), 'a');
      assertSame(run('"abc".charAt(-1);'), '');
      assertSame(run('"abc".charAt(3);'), '');
      assertSame(run('"abc".charAt(NaN);'), 'a');
      assertSame(run('"abc".charAt(1.9);'), 'b');
      assertSame(run('"abc".charAt(Infinity);'), '');
      assertSame(run('"abc".charAt(-Infinity);'), '');
      assertSame(run('String.prototype.charAt.call(5, 0);'), '5');
      assertSame(run('String.prototype.charAt.call(true, 0);'), 't');
      assertSame(
        run('String.fromCharCode(0xd800, 0xdc00).charAt(0).charCodeAt(0);'),
        0xd800,
      );
      assertSame(
        run('String.fromCharCode(0xd800, 0xdc00).charAt(1).charCodeAt(0);'),
        0xdc00,
      );
      assertSame(
        run(
          'var name; try { String.prototype.charAt.call(null, 0); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.charAt.call(undefined, 0); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'String.prototype.charCodeAt is generic with ToInteger position, NaN out of range, and code-unit semantics for surrogate pairs',
    run() {
      assertSame(run('"abc".charCodeAt(0);'), 97);
      assertSame(run('"abc".charCodeAt();'), 97);
      assertSame(
        Number.isNaN(/** @type {number} */ (run('"abc".charCodeAt(-1);'))),
        true,
      );
      assertSame(
        Number.isNaN(/** @type {number} */ (run('"abc".charCodeAt(3);'))),
        true,
      );
      assertSame(run('"abc".charCodeAt(NaN);'), 97);
      assertSame(run('"abc".charCodeAt(1.9);'), 98);
      assertSame(
        Number.isNaN(
          /** @type {number} */ (run('"abc".charCodeAt(Infinity);')),
        ),
        true,
      );
      assertSame(
        run('String.fromCharCode(0xd800, 0xdc00).charCodeAt(0);'),
        0xd800,
      );
      assertSame(
        run('String.fromCharCode(0xd800, 0xdc00).charCodeAt(1);'),
        0xdc00,
      );
      assertSame(run('String.prototype.charCodeAt.call(5, 0);'), 53);
      assertSame(
        run(
          'var name; try { String.prototype.charCodeAt.call(null, 0); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'charAt and charCodeAt validate the receiver before coercing the position argument, and propagate a guest position error by identity',
    run() {
      assertSame(
        run(
          'var order = ""; var name; ' +
            'var pos = { valueOf: function () { order += "pos"; return 0; } }; ' +
            'try { String.prototype.charAt.call(null, pos); } ' +
            'catch (error) { name = error.name; } ' +
            'name + ":" + order;',
        ),
        'TypeError:',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; var order = ""; ' +
            'var pos = { valueOf: function () { order += "pos"; throw thrown; } }; ' +
            'try { "abc".charAt(pos); } catch (error) { caught = error; } ' +
            '(caught === thrown) + ":" + order;',
        ),
        'true:pos',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "abc"; } }; ' +
            'var pos = { valueOf: function () { order += "p"; return 1; } }; ' +
            'String.prototype.charAt.call(receiver, pos) + ":" + order;',
        ),
        'b:rp',
      );
    },
  },
  {
    name: 'String.prototype.concat is generic and converts every argument left-to-right',
    run() {
      assertSame(run('"a".concat("b", "c");'), 'abc');
      assertSame(run('"a".concat();'), 'a');
      assertSame(
        run('"a".concat(1, true, null, undefined);'),
        'a1truenullundefined',
      );
      assertSame(run('String.prototype.concat.call(5, 6);'), '56');
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "a"; } }; ' +
            'var first = { toString: function () { order += "1"; return "b"; } }; ' +
            'var second = { toString: function () { order += "2"; return "c"; } }; ' +
            'String.prototype.concat.call(receiver, first, second) + ":" + order;',
        ),
        'abc:r12',
      );
      assertSame(
        run(
          'var name; try { String.prototype.concat.call(null); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var thrown = new Error("boom"); var caught; var order = ""; ' +
          'var first = { toString: function () { order += "1"; return "b"; } }; ' +
          'var bad = { toString: function () { order += "bad"; throw thrown; } }; ' +
          'try { "a".concat(first, bad); } catch (error) { caught = error; } ' +
          '(caught === thrown) + ":" + order;',
      );

      assertSame(completion.value, 'true:1bad');
    },
  },
  {
    name: 'String.prototype.slice handles omitted vs undefined, negative/fractional/NaN/infinite indices without swapping, and clamps to bounds',
    run() {
      assertSame(run('"abcdef".slice();'), 'abcdef');
      assertSame(run('"abcdef".slice(2);'), 'cdef');
      assertSame(run('"abcdef".slice(2, undefined);'), 'cdef');
      assertSame(run('"abcdef".slice(-2);'), 'ef');
      assertSame(run('"abcdef".slice(2, 4);'), 'cd');
      assertSame(run('"abcdef".slice(4, 2);'), '');
      assertSame(run('"abcdef".slice(-100, 100);'), 'abcdef');
      assertSame(run('"abcdef".slice(NaN, NaN);'), '');
      assertSame(run('"abcdef".slice(1.9, 4.9);'), 'bcd');
      assertSame(run('"abcdef".slice(Infinity, -Infinity);'), '');
      assertSame(run('"abcdef".slice(-Infinity, Infinity);'), 'abcdef');
      assertSame(run('"".slice(0, 5);'), '');
      assertSame(run('String.prototype.slice.call(123, 1);'), '23');
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "hello"; } }; ' +
            'var start = { valueOf: function () { order += "s"; return 1; } }; ' +
            'var end = { valueOf: function () { order += "e"; return 3; } }; ' +
            'String.prototype.slice.call(receiver, start, end) + ":" + order;',
        ),
        'el:rse',
      );
      assertSame(
        run(
          'var name; try { String.prototype.slice.call(null, 0); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'String.prototype.substring handles omitted vs undefined, negative/fractional/NaN/infinite indices, and swaps out-of-order bounds',
    run() {
      assertSame(run('"abcdef".substring();'), 'abcdef');
      assertSame(run('"abcdef".substring(2);'), 'cdef');
      assertSame(run('"abcdef".substring(2, undefined);'), 'cdef');
      assertSame(run('"abcdef".substring(4, 2);'), 'cd');
      assertSame(run('"abcdef".substring(-100, 100);'), 'abcdef');
      assertSame(run('"abcdef".substring(NaN, NaN);'), '');
      assertSame(run('"abcdef".substring(1.9, 4.9);'), 'bcd');
      assertSame(run('"abcdef".substring(-1, -1);'), '');
      assertSame(run('"abcdef".substring(Infinity, -Infinity);'), 'abcdef');
      assertSame(run('"".substring(0, 5);'), '');
      assertSame(run('String.prototype.substring.call(123, 1);'), '23');
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "hello"; } }; ' +
            'var start = { valueOf: function () { order += "s"; return 3; } }; ' +
            'var end = { valueOf: function () { order += "e"; return 1; } }; ' +
            'String.prototype.substring.call(receiver, start, end) + ":" + order;',
        ),
        'el:rse',
      );
      assertSame(
        run(
          'var name; try { String.prototype.substring.call(undefined, 0); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'String.prototype.substr handles omitted length as +Infinity, negative start wrapping, fractional/NaN/infinite lengths, and clamps to an empty string when the result length is non-positive',
    run() {
      assertSame(run('"abcdef".substr();'), 'abcdef');
      assertSame(run('"abcdef".substr(2);'), 'cdef');
      assertSame(run('"abcdef".substr(2, undefined);'), 'cdef');
      assertSame(run('"abcdef".substr(-2);'), 'ef');
      assertSame(run('"abcdef".substr(-100);'), 'abcdef');
      assertSame(run('"abcdef".substr(2, 2);'), 'cd');
      assertSame(run('"abcdef".substr(2, -1);'), '');
      assertSame(run('"abcdef".substr(2, 0);'), '');
      assertSame(run('"abcdef".substr(2, 100);'), 'cdef');
      assertSame(run('"abcdef".substr(NaN, NaN);'), '');
      assertSame(run('"abcdef".substr(1.9, 2.9);'), 'bc');
      assertSame(run('"abcdef".substr(-1.9);'), 'f');
      assertSame(run('"abcdef".substr(Infinity);'), '');
      assertSame(run('"abcdef".substr(-Infinity);'), 'abcdef');
      assertSame(run('"abcdef".substr(2, Infinity);'), 'cdef');
      assertSame(run('"abcdef".substr(2, -Infinity);'), '');
      assertSame(run('"".substr(0, 5);'), '');
      assertSame(run('String.prototype.substr.call(123, 1);'), '23');
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "hello"; } }; ' +
            'var start = { valueOf: function () { order += "s"; return 1; } }; ' +
            'var length = { valueOf: function () { order += "l"; return 2; } }; ' +
            'String.prototype.substr.call(receiver, start, length) + ":" + order;',
        ),
        'el:rsl',
      );
      assertSame(
        run(
          'var name; try { String.prototype.substr.call(null, 0); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'slice/substring/substr propagate a guest error thrown while coercing an index argument, by identity, without mutating the receiver',
    run() {
      const realm = createRealm();

      for (const method of ['slice', 'substring', 'substr']) {
        const completion = evaluateScript(
          realm,
          `var thrown = new Error("boom-${method}"); var caught; ` +
            'var end = { valueOf: function () { throw thrown; } }; ' +
            `var s = "abcdef"; try { s.${method}(0, end); } catch (error) { caught = error; } ` +
            '(caught === thrown) + ":" + s;',
        );

        assertSame(completion.value, 'true:abcdef');
      }
    },
  },
  {
    name: 'String, String.prototype methods carry exact ES5 length/name and descriptors, and no method mutates its receiver',
    run() {
      assertSame(run('String.length;'), 1);
      assertSame(run('String.name;'), 'String');

      const methodLengths = {
        toString: 0,
        valueOf: 0,
        charAt: 1,
        charCodeAt: 1,
        concat: 1,
        slice: 2,
        substring: 2,
        substr: 2,
      };

      for (const [name, length] of Object.entries(methodLengths)) {
        assertSame(
          run(`String.prototype.${name}.length;`),
          length,
          `${name} length`,
        );
        assertSame(run(`String.prototype.${name}.name;`), name, `${name} name`);
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(String.prototype, "${name}"); ` +
              'd.writable + ":" + d.enumerable + ":" + d.configurable;',
          ),
          'true:false:true',
          `${name} descriptor`,
        );
      }

      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(String.prototype, "constructor"); ' +
            '(d.value === String) + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:true:false:true',
      );
      assertSame(
        run(
          'var s = "abcdef"; ' +
            's.slice(1, 3); s.substring(1, 3); s.substr(1, 2); s.concat("x"); s.charAt(0); ' +
            's;',
        ),
        'abcdef',
      );
    },
  },
];

export default tests;
