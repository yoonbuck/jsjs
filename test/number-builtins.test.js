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
    name: 'Number called as a function converts its argument with ToNumber and never boxes, distinguishing omitted from undefined',
    run() {
      assertSame(run('typeof Number(1);'), 'number');
      assertSame(run('Number();'), 0);
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Number(undefined);'))),
        true,
      );
      assertSame(run('Number(null);'), 0);
      assertSame(run('Number(true);'), 1);
      assertSame(run('Number(false);'), 0);
      assertSame(run('Number("");'), 0);
      assertSame(run('Number("  42 ");'), 42);
      assertSame(run('Number("0x1F");'), 31);
      assertSame(Object.is(run('Number("-0");'), -0), true);
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Number("abc");'))),
        true,
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var value = { valueOf: function () { order += "v"; return 5; }, ' +
            'toString: function () { order += "t"; return "9"; } }; ' +
            'Number(value) + ":" + order;',
        ),
        '5:v',
      );
    },
  },
  {
    name: 'new Number boxes the ToNumber-converted primitive as a Number object',
    run() {
      assertSame(run('typeof new Number(5);'), 'object');
      assertSame(
        run('Object.prototype.toString.call(new Number(5));'),
        '[object Number]',
      );
      assertSame(run('new Number(5) instanceof Number;'), true);
      assertSame(run('new Number("7").valueOf();'), 7);
      assertSame(run('new Number().valueOf();'), 0);
      assertSame(run('new Number(0) == 0;'), true);
      assertSame(run('new Number(0) === 0;'), false);
    },
  },
  {
    name: 'wrapper identity is realm-local for Number',
    run() {
      const first = createRealm();
      const second = createRealm();

      evaluateScript(first, 'var boxed = new Number(3);');

      const boxed = first.globalObject.get('boxed');

      second.globalObject.defineOwnProperty('foreign', {
        value: boxed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(second, 'foreign instanceof Number;').value,
        false,
      );
      assertSame(
        evaluateScript(second, 'Number.prototype.valueOf.call(foreign);').value,
        3,
      );
      assertSame(
        evaluateScript(second, 'Number.prototype.toString.call(foreign);')
          .value,
        '3',
      );
    },
  },
  {
    name: 'Number constants carry the exact ES5 values and are non-writable, non-enumerable, non-configurable',
    run() {
      assertSame(run('Number.MAX_VALUE;'), Number.MAX_VALUE);
      assertSame(run('Number.MIN_VALUE;'), Number.MIN_VALUE);
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Number.NaN;'))),
        true,
      );
      assertSame(run('Number.NEGATIVE_INFINITY;'), -Infinity);
      assertSame(run('Number.POSITIVE_INFINITY;'), Infinity);

      for (const name of [
        'MAX_VALUE',
        'MIN_VALUE',
        'NaN',
        'NEGATIVE_INFINITY',
        'POSITIVE_INFINITY',
      ]) {
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(Number, "${name}"); ` +
              'd.writable + ":" + d.enumerable + ":" + d.configurable;',
          ),
          'false:false:false',
        );
      }
    },
  },
  {
    name: 'Number.prototype.valueOf works on primitives, matching wrappers, and rejects incompatible receivers',
    run() {
      assertSame(run('(5).valueOf();'), 5);
      assertSame(run('(new Number(5)).valueOf();'), 5);
      assertSame(run('Number.prototype.valueOf();'), 0);
      assertSame(
        run(
          'var name; try { Number.prototype.valueOf.call("5"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Number.prototype.valueOf.call(true); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Number.prototype.valueOf.call(new Boolean(true)); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'Number.prototype.valueOf.call({});',
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
    name: 'Number.prototype.toString with omitted, undefined, or 10 radix uses default decimal conversion',
    run() {
      assertSame(run('(0).toString();'), '0');
      assertSame(run('(0).toString(undefined);'), '0');
      assertSame(run('(0).toString(10);'), '0');
      assertSame(run('(-1).toString();'), '-1');
      assertSame(run('(255).toString();'), '255');
      assertSame(run('(3.5).toString();'), '3.5');
      assertSame(run('NaN.toString();'), 'NaN');
      assertSame(run('Number.POSITIVE_INFINITY.toString();'), 'Infinity');
      assertSame(run('Number.NEGATIVE_INFINITY.toString();'), '-Infinity');
      assertSame(run('(-0).toString();'), '0');
      assertSame(run('(new Number(42)).toString();'), '42');
      assertSame(run('Number.prototype.toString();'), '0');
    },
  },
  {
    name: 'Number.prototype.toString accepts integer radices from 2 to 36 with signed zero, negatives, NaN, and infinities',
    run() {
      assertSame(run('(5).toString(2);'), '101');
      assertSame(run('(-8).toString(2);'), '-1000');
      assertSame(run('(0).toString(2);'), '0');
      assertSame(run('(-0).toString(2);'), '0');
      assertSame(run('NaN.toString(2);'), 'NaN');
      assertSame(run('Number.POSITIVE_INFINITY.toString(2);'), 'Infinity');
      assertSame(run('Number.NEGATIVE_INFINITY.toString(16);'), '-Infinity');
      assertSame(run('(255).toString(16);'), 'ff');
      assertSame(run('(35).toString(36);'), 'z');
      assertSame(run('(1).toString(36);'), '1');
      assertSame(run('(-1).toString(36);'), '-1');
      assertSame(run('(0.5).toString(2);'), '0.1');
      assertSame(run('(2.5).toString(2);'), '10.1');
      assertSame(run('(0.25).toString(16);'), '0.4');
      assertSame(run('(5).toString(2.9);'), '101');
    },
  },
  {
    name: 'Number.prototype.toString rejects out-of-range and non-finite radices with a guest RangeError',
    run() {
      assertSame(
        run(
          'var name; try { (5).toString(1); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
      assertSame(
        run(
          'var name; try { (5).toString(37); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
      assertSame(
        run(
          'var name; try { (5).toString(Infinity); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
      assertSame(
        run(
          'var name; try { (5).toString(-Infinity); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
      assertSame(
        run(
          'var name; try { (5).toString(NaN); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'Number.prototype.toString validates the receiver before evaluating the radix argument, and propagates guest radix errors by identity',
    run() {
      assertSame(
        run(
          'var order = ""; var name; ' +
            'try { Number.prototype.toString.call({}, { valueOf: function () { order += "radix"; return 10; } }); } ' +
            'catch (error) { name = error.name; } ' +
            'name + ":" + order;',
        ),
        'TypeError:',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; var order = ""; ' +
            'var radix = { valueOf: function () { order += "radix"; throw thrown; } }; ' +
            'try { (5).toString(radix); } catch (error) { caught = error; } ' +
            '(caught === thrown) + ":" + order;',
        ),
        'true:radix',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var radix = { valueOf: function () { order += "v"; return 16; }, ' +
            'toString: function () { order += "t"; return "16"; } }; ' +
            '(255).toString(radix) + ":" + order;',
        ),
        'ff:v',
      );
    },
  },
  {
    name: 'Number.prototype.toString and valueOf accept a matching wrapper from a foreign realm and reject non-Number wrappers',
    run() {
      const first = createRealm();
      const second = createRealm();

      evaluateScript(first, 'var boxed = new Number(9);');

      const boxed = first.globalObject.get('boxed');

      second.globalObject.defineOwnProperty('foreign', {
        value: boxed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(second, 'Number.prototype.toString.call(foreign, 2);')
          .value,
        '1001',
      );
      assertSame(
        evaluateScript(second, 'Number.prototype.valueOf.call(foreign);').value,
        9,
      );
    },
  },
  {
    name: 'Number.prototype.toLocaleString delegates only to engine-defined ToString(10) behavior, not a guest-overridden toString',
    run() {
      assertSame(run('(255).toLocaleString();'), '255');
      assertSame(run('Number.prototype.toLocaleString();'), '0');
      assertSame(
        run(
          'var boxed = new Number(255); ' +
            'boxed.toString = function () { return "OVERRIDDEN"; }; ' +
            'boxed.toLocaleString();',
        ),
        '255',
      );
      assertSame(
        run(
          'var name; try { Number.prototype.toLocaleString.call("5"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Number.prototype.toLocaleString.call(undefined); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'Number.prototype.toLocaleString.call({});',
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
    name: 'Number, Number.prototype.valueOf, toString, and toLocaleString carry ES5 length/name and descriptors',
    run() {
      assertSame(run('Number.length;'), 1);
      assertSame(run('Number.name;'), 'Number');
      assertSame(run('Number.prototype.valueOf.length;'), 0);
      assertSame(run('Number.prototype.valueOf.name;'), 'valueOf');
      assertSame(run('Number.prototype.toString.length;'), 1);
      assertSame(run('Number.prototype.toString.name;'), 'toString');
      assertSame(run('Number.prototype.toLocaleString.length;'), 0);
      assertSame(
        run('Number.prototype.toLocaleString.name;'),
        'toLocaleString',
      );

      for (const method of ['valueOf', 'toString', 'toLocaleString']) {
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(Number.prototype, "${method}"); ` +
              'd.writable + ":" + d.enumerable + ":" + d.configurable;',
          ),
          'true:false:true',
        );
      }

      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Number.prototype, "constructor"); ' +
            '(d.value === Number) + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:true:false:true',
      );
    },
  },
];

export default tests;
