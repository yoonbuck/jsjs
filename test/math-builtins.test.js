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

/**
 * Asserts every expression in `cases` evaluates to its paired value, using
 * SameValue so `-0` and `+0` are distinguished the way ES5 15.8.2's signed
 * zero rules require.
 *
 * @param {readonly [string, unknown][]} cases
 * @returns {void}
 */
function assertExpressions(cases) {
  for (const [source, expected] of cases) {
    assertSame(run(`${source};`), expected, source);
  }
}

const tests = [
  {
    name: 'the Math object is an ordinary non-callable object with class "Math" and standard global attributes',
    run() {
      assertSame(run('typeof Math;'), 'object');
      assertSame(run('Object.prototype.toString.call(Math);'), '[object Math]');
      assertSame(
        run('Object.getPrototypeOf(Math) === Object.prototype;'),
        true,
      );
      // ES5 15.8: the Math object has no [[Call]], no [[Construct]], and no
      // "prototype" property.
      assertSame(run('Math.prototype;'), undefined);
      assertSame(
        run('try { Math(); } catch (e) { e instanceof TypeError; }'),
        true,
      );
      assertSame(
        run('try { new Math(); } catch (e) { e instanceof TypeError; }'),
        true,
      );

      const descriptor = 'Object.getOwnPropertyDescriptor(this, "Math")';
      assertSame(run(`${descriptor}.writable;`), true);
      assertSame(run(`${descriptor}.enumerable;`), false);
      assertSame(run(`${descriptor}.configurable;`), true);
    },
  },
  {
    name: 'Math carries the eight ES5 constants as non-writable, non-enumerable, non-configurable data properties',
    run() {
      /** @type {readonly [string, number][]} */
      const constants = [
        ['E', Math.E],
        ['LN10', Math.LN10],
        ['LN2', Math.LN2],
        ['LOG2E', Math.LOG2E],
        ['LOG10E', Math.LOG10E],
        ['PI', Math.PI],
        ['SQRT1_2', Math.SQRT1_2],
        ['SQRT2', Math.SQRT2],
      ];

      for (const [name, value] of constants) {
        assertSame(run(`Math.${name};`), value, name);

        const descriptor = `Object.getOwnPropertyDescriptor(Math, "${name}")`;

        assertSame(run(`${descriptor}.writable;`), false, name);
        assertSame(run(`${descriptor}.enumerable;`), false, name);
        assertSame(run(`${descriptor}.configurable;`), false, name);
        // Non-writable in the strong sense: a sloppy-mode assignment is a
        // silent no-op rather than a redefinition.
        assertSame(run(`Math.${name} = 1; Math.${name};`), value, name);
      }
    },
  },
  {
    name: 'every Math function has its ES5 name and length and standard method attributes',
    run() {
      /** @type {readonly [string, number][]} */
      const signatures = [
        ['abs', 1],
        ['acos', 1],
        ['asin', 1],
        ['atan', 1],
        ['atan2', 2],
        ['ceil', 1],
        ['cos', 1],
        ['exp', 1],
        ['floor', 1],
        ['log', 1],
        ['max', 2],
        ['min', 2],
        ['pow', 2],
        ['random', 0],
        ['round', 1],
        ['sin', 1],
        ['sqrt', 1],
        ['tan', 1],
      ];

      for (const [name, length] of signatures) {
        assertSame(run(`typeof Math.${name};`), 'function', name);
        assertSame(run(`Math.${name}.length;`), length, name);
        assertSame(run(`Math.${name}.name;`), name, name);
        assertSame(run(`Math.${name}.prototype;`), undefined, name);
        assertSame(
          run(
            `try { new Math.${name}(1); } catch (e) { e instanceof TypeError; }`,
          ),
          true,
          name,
        );

        const descriptor = `Object.getOwnPropertyDescriptor(Math, "${name}")`;

        assertSame(run(`${descriptor}.writable;`), true, name);
        assertSame(run(`${descriptor}.enumerable;`), false, name);
        assertSame(run(`${descriptor}.configurable;`), true, name);
      }
    },
  },
  {
    name: 'Math.abs implements the ES5 15.8.2.1 special cases',
    run() {
      assertExpressions([
        ['Math.abs(NaN)', NaN],
        ['Math.abs(-0)', 0],
        ['Math.abs(0)', 0],
        ['Math.abs(-Infinity)', Infinity],
        ['Math.abs(Infinity)', Infinity],
        ['Math.abs(-3.5)', 3.5],
        ['Math.abs(3.5)', 3.5],
        ['Math.abs("-7")', 7],
        ['Math.abs()', NaN],
        ['Math.abs(undefined)', NaN],
        ['Math.abs(null)', 0],
        ['Math.abs(true)', 1],
      ]);
    },
  },
  {
    name: 'Math.ceil and Math.floor preserve signed zero and satisfy ceil(x) === -floor(-x)',
    run() {
      assertExpressions([
        ['Math.ceil(NaN)', NaN],
        ['Math.ceil(0)', 0],
        ['Math.ceil(-0)', -0],
        ['Math.ceil(Infinity)', Infinity],
        ['Math.ceil(-Infinity)', -Infinity],
        // -1 < x < 0 rounds up to -0, not +0.
        ['Math.ceil(-0.5)', -0],
        ['Math.ceil(-0.999)', -0],
        ['Math.ceil(0.5)', 1],
        ['Math.ceil(4)', 4],
        ['Math.ceil(-4.2)', -4],
        ['Math.floor(NaN)', NaN],
        ['Math.floor(0)', 0],
        ['Math.floor(-0)', -0],
        ['Math.floor(Infinity)', Infinity],
        ['Math.floor(-Infinity)', -Infinity],
        ['Math.floor(0.5)', 0],
        ['Math.floor(-0.5)', -1],
        ['Math.floor(4.9)', 4],
        ['Math.floor(-4.2)', -5],
        ['Math.ceil(-0.5) === -Math.floor(0.5)', true],
        ['1 / Math.ceil(-0.5)', -Infinity],
        ['1 / Math.floor(-0)', -Infinity],
      ]);
    },
  },
  {
    name: 'Math.round rounds halves toward +Infinity and returns -0 for -0.5 <= x < 0',
    run() {
      assertExpressions([
        ['Math.round(NaN)', NaN],
        ['Math.round(0)', 0],
        ['Math.round(-0)', -0],
        ['Math.round(Infinity)', Infinity],
        ['Math.round(-Infinity)', -Infinity],
        // 0 < x < 0.5 is +0; -0.5 <= x < 0 is -0.
        ['Math.round(0.4)', 0],
        ['Math.round(-0.5)', -0],
        ['Math.round(-0.4)', -0],
        ['1 / Math.round(-0.5)', -Infinity],
        ['1 / Math.round(0.4)', Infinity],
        // Ties go to the larger value, so -3.5 rounds to -3, not -4.
        ['Math.round(3.5)', 4],
        ['Math.round(-3.5)', -3],
        ['Math.round(2.5)', 3],
        ['Math.round(-2.5)', -2],
        ['Math.round(0.5)', 1],
        // The double nearest below 0.5 must round down, which
        // floor(x + 0.5) famously gets wrong.
        ['Math.round(0.49999999999999994)', 0],
        // Values at and beyond 2^52 are already integers.
        ['Math.round(4503599627370496)', 4503599627370496],
        ['Math.round(-4503599627370496)', -4503599627370496],
      ]);
    },
  },
  {
    name: 'Math.max and Math.min coerce every argument before comparing and order signed zeros',
    run() {
      assertExpressions([
        // With no arguments the identities are the infinities.
        ['Math.max()', -Infinity],
        ['Math.min()', Infinity],
        ['Math.max(1, 2, 3)', 3],
        ['Math.min(1, 2, 3)', 1],
        ['Math.max(NaN, 1)', NaN],
        ['Math.min(1, NaN)', NaN],
        ['Math.max("3", "10")', 10],
        ['Math.min(true, 2)', 1],
        ['Math.max(undefined, 1)', NaN],
        // +0 is larger than -0 for max, and -0 smaller for min.
        ['1 / Math.max(0, -0)', Infinity],
        ['1 / Math.max(-0, 0)', Infinity],
        ['1 / Math.min(0, -0)', -Infinity],
        ['1 / Math.min(-0, 0)', -Infinity],
        ['1 / Math.max(-0, -0)', -Infinity],
        ['1 / Math.min(0, 0)', Infinity],
      ]);

      // Every argument is coerced, in order, even once a NaN is known: the
      // spec calls ToNumber on each argument before comparing any of them.
      assertSame(
        run(
          'var order = ""; ' +
            'function probe(tag, value) { ' +
            '  return { valueOf: function () { order += tag; return value; } }; ' +
            '} ' +
            'var result = Math.max(probe("a", NaN), probe("b", 1), probe("c", 2)); ' +
            'order + ":" + result;',
        ),
        'abc:NaN',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'function probe(tag, value) { ' +
            '  return { valueOf: function () { order += tag; return value; } }; ' +
            '} ' +
            'Math.min(probe("a", 3), probe("b", 1)) + ":" + order;',
        ),
        '1:ab',
      );
      // An abrupt completion from a later argument still propagates.
      assertSame(
        run(
          'try { Math.max(1, { valueOf: function () { throw new RangeError("x"); } }); } ' +
            'catch (e) { e instanceof RangeError; }',
        ),
        true,
      );
    },
  },
  {
    name: 'Math.pow implements the ES5 15.8.2.13 special-case table',
    run() {
      assertExpressions([
        ['Math.pow(2, 10)', 1024],
        ['Math.pow(2, NaN)', NaN],
        // y is +0 or -0 wins over every x, including NaN.
        ['Math.pow(NaN, 0)', 1],
        ['Math.pow(NaN, -0)', 1],
        ['Math.pow(NaN, 1)', NaN],
        // abs(x) === 1 with an infinite exponent is NaN, not 1.
        ['Math.pow(1, Infinity)', NaN],
        ['Math.pow(1, -Infinity)', NaN],
        ['Math.pow(-1, Infinity)', NaN],
        ['Math.pow(-1, -Infinity)', NaN],
        ['Math.pow(1.1, Infinity)', Infinity],
        ['Math.pow(1.1, -Infinity)', 0],
        ['Math.pow(0.9, Infinity)', 0],
        ['Math.pow(0.9, -Infinity)', Infinity],
        ['Math.pow(Infinity, 1)', Infinity],
        ['Math.pow(Infinity, -1)', 0],
        ['Math.pow(-Infinity, 3)', -Infinity],
        ['Math.pow(-Infinity, 2)', Infinity],
        ['1 / Math.pow(-Infinity, -3)', -Infinity],
        ['1 / Math.pow(-Infinity, -2)', Infinity],
        ['Math.pow(0, 1)', 0],
        ['Math.pow(0, -1)', Infinity],
        ['Math.pow(-0, 3)', -0],
        ['1 / Math.pow(-0, 3)', -Infinity],
        ['Math.pow(-0, 2)', 0],
        ['Math.pow(-0, -3)', -Infinity],
        ['Math.pow(-0, -2)', Infinity],
        // A negative base with a non-integral exponent has no real result.
        ['Math.pow(-2, 0.5)', NaN],
        ['Math.pow(-8, 1 / 3)', NaN],
        ['Math.pow("2", "3")', 8],
      ]);

      assertSame(
        run(
          'var order = ""; ' +
            'function probe(tag, value) { ' +
            '  return { valueOf: function () { order += tag; return value; } }; ' +
            '} ' +
            'Math.pow(probe("x", 2), probe("y", 3)) + ":" + order;',
        ),
        '8:xy',
      );
    },
  },
  {
    name: 'Math.sqrt, Math.exp, and Math.log implement their ES5 special cases',
    run() {
      assertExpressions([
        ['Math.sqrt(NaN)', NaN],
        ['Math.sqrt(-1)', NaN],
        ['Math.sqrt(-0.5)', NaN],
        ['Math.sqrt(0)', 0],
        ['Math.sqrt(-0)', -0],
        ['1 / Math.sqrt(-0)', -Infinity],
        ['Math.sqrt(Infinity)', Infinity],
        ['Math.sqrt(-Infinity)', NaN],
        ['Math.sqrt(9)', 3],

        ['Math.exp(NaN)', NaN],
        ['Math.exp(0)', 1],
        ['Math.exp(-0)', 1],
        ['Math.exp(Infinity)', Infinity],
        ['Math.exp(-Infinity)', 0],

        ['Math.log(NaN)', NaN],
        ['Math.log(-1)', NaN],
        ['Math.log(-0.5)', NaN],
        ['Math.log(0)', -Infinity],
        ['Math.log(-0)', -Infinity],
        ['Math.log(1)', 0],
        ['Math.log(Infinity)', Infinity],
        ['Math.log(-Infinity)', NaN],
      ]);
    },
  },
  {
    name: 'the trigonometric and inverse-trigonometric functions implement their ES5 special cases',
    run() {
      assertExpressions([
        ['Math.sin(NaN)', NaN],
        ['Math.sin(0)', 0],
        ['Math.sin(-0)', -0],
        ['1 / Math.sin(-0)', -Infinity],
        ['Math.sin(Infinity)', NaN],
        ['Math.sin(-Infinity)', NaN],

        ['Math.cos(NaN)', NaN],
        ['Math.cos(0)', 1],
        ['Math.cos(-0)', 1],
        ['Math.cos(Infinity)', NaN],
        ['Math.cos(-Infinity)', NaN],

        ['Math.tan(NaN)', NaN],
        ['Math.tan(0)', 0],
        ['Math.tan(-0)', -0],
        ['1 / Math.tan(-0)', -Infinity],
        ['Math.tan(Infinity)', NaN],
        ['Math.tan(-Infinity)', NaN],

        ['Math.asin(NaN)', NaN],
        ['Math.asin(2)', NaN],
        ['Math.asin(-2)', NaN],
        ['Math.asin(0)', 0],
        ['Math.asin(-0)', -0],
        ['1 / Math.asin(-0)', -Infinity],
        ['Math.asin(1)', Math.PI / 2],

        ['Math.acos(NaN)', NaN],
        ['Math.acos(2)', NaN],
        ['Math.acos(-2)', NaN],
        ['Math.acos(1)', 0],
        ['Math.acos(0)', Math.PI / 2],

        ['Math.atan(NaN)', NaN],
        ['Math.atan(0)', 0],
        ['Math.atan(-0)', -0],
        ['1 / Math.atan(-0)', -Infinity],
        ['Math.atan(Infinity)', Math.PI / 2],
        ['Math.atan(-Infinity)', -Math.PI / 2],
      ]);
    },
  },
  {
    name: 'Math.atan2 implements the full ES5 15.8.2.5 quadrant and signed-zero table',
    run() {
      assertExpressions([
        ['Math.atan2(NaN, 1)', NaN],
        ['Math.atan2(1, NaN)', NaN],

        ['Math.atan2(1, 0)', Math.PI / 2],
        ['Math.atan2(1, -0)', Math.PI / 2],
        ['Math.atan2(-1, 0)', -Math.PI / 2],
        ['Math.atan2(-1, -0)', -Math.PI / 2],

        // y is +0: the result depends on the sign of x.
        ['Math.atan2(0, 1)', 0],
        ['1 / Math.atan2(0, 1)', Infinity],
        ['Math.atan2(0, 0)', 0],
        ['Math.atan2(0, -1)', Math.PI],
        ['Math.atan2(0, -0)', Math.PI],

        // y is -0: mirrored, with -0 and -PI.
        ['Math.atan2(-0, 1)', -0],
        ['1 / Math.atan2(-0, 1)', -Infinity],
        ['Math.atan2(-0, 0)', -0],
        ['Math.atan2(-0, -1)', -Math.PI],
        ['Math.atan2(-0, -0)', -Math.PI],

        ['Math.atan2(Infinity, 1)', Math.PI / 2],
        ['Math.atan2(-Infinity, 1)', -Math.PI / 2],
        ['Math.atan2(1, Infinity)', 0],
        ['1 / Math.atan2(1, Infinity)', Infinity],
        ['Math.atan2(-1, Infinity)', -0],
        ['1 / Math.atan2(-1, Infinity)', -Infinity],
        ['Math.atan2(1, -Infinity)', Math.PI],
        ['Math.atan2(-1, -Infinity)', -Math.PI],

        // Both infinite: the four diagonals.
        ['Math.atan2(Infinity, Infinity)', Math.PI / 4],
        ['Math.atan2(Infinity, -Infinity)', (3 * Math.PI) / 4],
        ['Math.atan2(-Infinity, Infinity)', -Math.PI / 4],
        ['Math.atan2(-Infinity, -Infinity)', (-3 * Math.PI) / 4],

        ['Math.atan2(1, 1)', Math.PI / 4],
      ]);

      assertSame(
        run(
          'var order = ""; ' +
            'function probe(tag, value) { ' +
            '  return { valueOf: function () { order += tag; return value; } }; ' +
            '} ' +
            'Math.atan2(probe("y", 0), probe("x", 1)) + ":" + order;',
        ),
        '0:yx',
      );
    },
  },
  {
    name: 'Math.random returns distinct numbers inside [0, 1)',
    run() {
      const realm = createRealm();
      /** @type {number[]} */
      const samples = [];

      for (let index = 0; index < 64; index += 1) {
        const value = evaluateScript(realm, 'Math.random();').value;

        assertSame(typeof value, 'number');
        assertSame(
          typeof value === 'number' && value >= 0 && value < 1,
          true,
          `Math.random() must be in [0, 1): ${String(value)}`,
        );
        samples.push(/** @type {number} */ (value));
      }

      // A generator stuck on one value would satisfy the range check alone.
      assertSame(
        new Set(samples).size > 1,
        true,
        'Math.random() must not return a constant',
      );
    },
  },
  {
    name: 'Math functions are generic on their receiver and coerce arguments with ToNumber',
    run() {
      assertExpressions([
        // Detached from Math, they still work: none of them touches `this`.
        ['var f = Math.abs; f(-2)', 2],
        ['Math.floor.call(null, 1.7)', 1],
        ['Math.max.apply(null, [1, 5, 2])', 5],
        // ToNumber runs through valueOf, then toString.
        ['Math.abs({ valueOf: function () { return -4; } })', 4],
        ['Math.abs({ toString: function () { return "-4"; } })', 4],
        ['Math.sqrt(new Number(16))', 4],
        ['Math.floor("  3.9  ")', 3],
        ['Math.floor("0x10")', 16],
        ['Math.abs("nope")', NaN],
      ]);

      assertSame(
        run(
          'try { Math.abs({ valueOf: function () { throw new TypeError("x"); } }); } ' +
            'catch (e) { e instanceof TypeError; }',
        ),
        true,
      );
    },
  },
  {
    name: 'Math is realm-local: two realms never share the Math object or its functions',
    run() {
      const first = createRealm();
      const second = createRealm();

      assertSame(first.globalObject.get('Math') === undefined, false);
      assertSame(
        first.globalObject.get('Math') === second.globalObject.get('Math'),
        false,
      );

      evaluateScript(first, 'Math.injected = 1;');

      assertSame(evaluateScript(second, 'Math.injected;').value, undefined);
    },
  },
];

export default tests;
