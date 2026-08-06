/**
 * ES5 15.7.4.5-15.7.4.7 `Number.prototype.toFixed`, `toExponential`, and
 * `toPrecision`.
 *
 * Every expectation in this suite is derived from the exact mathematical
 * value of the IEEE-754 double involved, never from a host formatting
 * method: the interesting cases (`(1.005).toFixed(2)`, `(1.45).toFixed(1)`,
 * `(930.9805).toFixed(3)`) are exactly the ones where the exact binary value
 * disagrees with the decimal literal that produced it, so a table of literal
 * strings is the only honest oracle.
 */

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
 * Evaluates a table of `[expression, expected string]` pairs in one realm.
 *
 * @param {readonly (readonly [string, string])[]} cases
 * @returns {void}
 */
function assertTable(cases) {
  const realm = createRealm();

  for (const [source, expected] of cases) {
    const completion = evaluateScript(realm, `${source};`);

    assertSame(completion.type, 'normal', source);
    assertSame(completion.value, expected, source);
  }
}

/**
 * @param {string} source An expression expected to throw a guest error.
 * @returns {string} The thrown error's `name`, or `"<no throw>"`.
 */
function throwsName(source) {
  return /** @type {string} */ (
    run(
      'var name = "<no throw>"; ' +
        `try { ${source}; } catch (error) { name = error.name; } ` +
        'name;',
    )
  );
}

/**
 * Exact-value expectations for `toFixed`.
 *
 * `n` is the integer nearest to `x x 10^f`, ties resolved to the larger `n`
 * (15.7.4.5 step 8a), computed against the exact value of the double:
 *
 * - `1.005` is exactly 1.00499999999999989341858963598497211933...,
 *   so two fraction digits round *down* to "1.00".
 * - `1.45` is exactly 1.44999999999999995559107901499373838305...  -> "1.4".
 * - `1.35` is exactly 1.35000000000000008881784197001252323389...  -> "1.4".
 * - `1.25` and `2.5` are exact, so they are true ties and round away from
 *   zero (to the larger `n` after the sign is split off) -> "1.3", "3".
 * - `930.9805` is exactly 930.98050000000000636646291241049766...   -> "930.981".
 * - `0.1` is exactly 0.1000000000000000055511151231257827021181583...,
 *   whose first 20 fraction digits are "10000000000000000555".
 * - `1e-7` is exactly 0.000000099999999999999995474811182588625868...,
 *   so eight fraction digits carry to "0.00000010" while seven give
 *   "0.0000001".
 * - `1000000000000000128` is exactly representable, so `toFixed(0)` prints
 *   all of its digits even though `ToString` prints 1000000000000000100.
 *
 * @type {readonly (readonly [string, string])[]}
 */
const TO_FIXED_CASES = Object.freeze([
  ['(0).toFixed()', '0'],
  ['(0).toFixed(undefined)', '0'],
  ['(0).toFixed(0)', '0'],
  ['(0).toFixed(2)', '0.00'],
  ['(-0).toFixed(2)', '0.00'],
  ['(0).toFixed(20)', '0.00000000000000000000'],
  ['(1).toFixed()', '1'],
  ['(1).toFixed(0)', '1'],
  ['(1).toFixed(1)', '1.0'],
  ['(1).toFixed(20)', '1.00000000000000000000'],
  ['(-1).toFixed(2)', '-1.00'],
  ['NaN.toFixed(2)', 'NaN'],
  ['Number.POSITIVE_INFINITY.toFixed(2)', 'Infinity'],
  ['Number.NEGATIVE_INFINITY.toFixed(2)', '-Infinity'],
  ['(0.5).toFixed(0)', '1'],
  ['(-0.5).toFixed(0)', '-1'],
  ['(1.5).toFixed(0)', '2'],
  ['(-1.5).toFixed(0)', '-2'],
  ['(2.5).toFixed(0)', '3'],
  ['(-2.5).toFixed(0)', '-3'],
  ['(1.25).toFixed(1)', '1.3'],
  ['(1.75).toFixed(1)', '1.8'],
  ['(1.35).toFixed(1)', '1.4'],
  ['(1.45).toFixed(1)', '1.4'],
  ['(1.005).toFixed(2)', '1.00'],
  ['(930.9805).toFixed(3)', '930.981'],
  ['(123.456).toFixed(2)', '123.46'],
  ['(123.456).toFixed(0)', '123'],
  ['(-123.456).toFixed(1)', '-123.5'],
  ['(0.999).toFixed(2)', '1.00'],
  ['(99.99).toFixed(1)', '100.0'],
  ['(9.995).toFixed(2)', '9.99'],
  ['(0.06).toFixed(1)', '0.1'],
  ['(0.04).toFixed(1)', '0.0'],
  ['(0.006).toFixed(1)', '0.0'],
  ['(0.005).toFixed(2)', '0.01'],
  ['(0.0000001).toFixed(2)', '0.00'],
  ['(0.1).toFixed(20)', '0.10000000000000000555'],
  ['(1e-7).toFixed(7)', '0.0000001'],
  ['(1e-7).toFixed(8)', '0.00000010'],
  ['(5e-324).toFixed(20)', '0.00000000000000000000'],
  ['(1000000000000000128).toFixed(0)', '1000000000000000128'],
  ['(1e20).toFixed(2)', '100000000000000000000.00'],
  ['(1e21).toFixed(0)', '1e+21'],
  ['(1e21).toFixed(2)', '1e+21'],
  ['(-1e21).toFixed(2)', '-1e+21'],
  ['Number.MAX_VALUE.toFixed(2)', '1.7976931348623157e+308'],
  ['(1).toFixed(NaN)', '1'],
  ['(1).toFixed(null)', '1'],
  ['(1).toFixed(true)', '1.0'],
  ['(1).toFixed("2")', '1.00'],
  ['(1).toFixed(2.9)', '1.00'],
  ['(1).toFixed(-0.5)', '1'],
  ['Number.prototype.toFixed(2)', '0.00'],
  ['(new Number(1.5)).toFixed(2)', '1.50'],
]);

/**
 * Exact-value expectations for `toExponential`.
 *
 * With `fractionDigits` supplied, `n` has exactly `f + 1` digits and is the
 * nearest such value to `x`, ties to the larger (15.7.4.6 step 12a):
 *
 * - `25` and `1.5` are exact ties at zero fraction digits -> "3e+1", "2e+0".
 * - `1.255` is exactly 1.25499999999999989341858963598497211933... -> "1.25e+0".
 * - `9.99` rounded to two significant digits carries to 10.0, and the carry
 *   raises the exponent -> "1.0e+1".
 * - `0.1`'s first 21 significant digits are "100000000000000005551", and the
 *   22nd is a 1, so `toExponential(20)` truncates -> "1.00000000000000005551e-1".
 * - `Number.MIN_VALUE` is exactly 4.9406564584124654...e-324.
 *
 * With `fractionDigits` omitted, `f` is the smallest digit count that still
 * round-trips (15.7.4.6 step 12b), which is the same `n` and `k` ES5 9.8.1
 * gives `ToString`.
 *
 * The exponent is never zero padded and always carries an explicit sign,
 * with `e+0` for a zero exponent (steps 14-16).
 *
 * @type {readonly (readonly [string, string])[]}
 */
const TO_EXPONENTIAL_CASES = Object.freeze([
  ['(0).toExponential()', '0e+0'],
  ['(0).toExponential(0)', '0e+0'],
  ['(0).toExponential(2)', '0.00e+0'],
  ['(-0).toExponential(1)', '0.0e+0'],
  ['(0).toExponential(20)', '0.00000000000000000000e+0'],
  ['NaN.toExponential(2)', 'NaN'],
  ['NaN.toExponential()', 'NaN'],
  ['Number.POSITIVE_INFINITY.toExponential(2)', 'Infinity'],
  ['Number.NEGATIVE_INFINITY.toExponential(2)', '-Infinity'],
  ['Number.POSITIVE_INFINITY.toExponential()', 'Infinity'],
  ['(1).toExponential(0)', '1e+0'],
  ['(1).toExponential(2)', '1.00e+0'],
  ['(1).toExponential()', '1e+0'],
  ['(-1).toExponential(1)', '-1.0e+0'],
  ['(1.5).toExponential(0)', '2e+0'],
  ['(-1.5).toExponential(0)', '-2e+0'],
  ['(25).toExponential(0)', '3e+1'],
  ['(-25).toExponential(0)', '-3e+1'],
  ['(11.2).toExponential()', '1.12e+1'],
  ['(11.2).toExponential(1)', '1.1e+1'],
  ['(123.456).toExponential(2)', '1.23e+2'],
  ['(123.456).toExponential()', '1.23456e+2'],
  ['(1.255).toExponential(2)', '1.25e+0'],
  ['(9.99).toExponential(1)', '1.0e+1'],
  ['(9.99).toExponential(0)', '1e+1'],
  ['(99).toExponential(0)', '1e+2'],
  ['(0.1).toExponential()', '1e-1'],
  ['(0.1).toExponential(20)', '1.00000000000000005551e-1'],
  ['(1e-7).toExponential()', '1e-7'],
  ['(1e-7).toExponential(1)', '1.0e-7'],
  ['(1e21).toExponential()', '1e+21'],
  ['(1e21).toExponential(2)', '1.00e+21'],
  ['(1e100).toExponential(1)', '1.0e+100'],
  ['(1e-100).toExponential(0)', '1e-100'],
  ['(123456).toExponential()', '1.23456e+5'],
  ['(123456).toExponential(20)', '1.23456000000000000000e+5'],
  ['Number.MAX_VALUE.toExponential(2)', '1.80e+308'],
  ['Number.MIN_VALUE.toExponential(2)', '4.94e-324'],
  ['Number.MIN_VALUE.toExponential()', '5e-324'],
  ['(1).toExponential(undefined)', '1e+0'],
  ['(1).toExponential(NaN)', '1e+0'],
  ['(1).toExponential(null)', '1e+0'],
  ['(1).toExponential("2")', '1.00e+0'],
  ['(1).toExponential(2.9)', '1.00e+0'],
  ['(1).toExponential(-0.5)', '1e+0'],
  ['Number.prototype.toExponential(2)', '0.00e+0'],
  ['(new Number(11.2)).toExponential(1)', '1.1e+1'],
]);

/**
 * Exact-value expectations for `toPrecision`.
 *
 * `e` is the decimal exponent *after* rounding to `p` significant digits, so
 * a carry can move the result across a notation boundary (15.7.4.7 step 10):
 *
 * - `9.9e-7` rounded to one digit is 1e-6, whose exponent -6 is *not*
 *   `< -6`, so it prints in fixed notation -> "0.000001".
 * - `9.999e20` rounded to three digits is 1.00e21, whose exponent 21 is
 *   `>= p`, so it prints in exponential notation -> "1.00e+21".
 * - `0.9999` rounded to two digits carries to 1.0.
 * - `0.1`'s first 21 significant digits are "100000000000000005551".
 *
 * `precision` undefined (or absent) short-circuits to `ToString` before the
 * range check, and NaN/Infinity short-circuit before it as well (steps 2-8).
 *
 * @type {readonly (readonly [string, string])[]}
 */
const TO_PRECISION_CASES = Object.freeze([
  ['(123.456).toPrecision()', '123.456'],
  ['(123.456).toPrecision(undefined)', '123.456'],
  ['(-0).toPrecision()', '0'],
  ['NaN.toPrecision()', 'NaN'],
  ['Number.POSITIVE_INFINITY.toPrecision()', 'Infinity'],
  ['(1e21).toPrecision()', '1e+21'],
  ['NaN.toPrecision(2)', 'NaN'],
  ['Number.POSITIVE_INFINITY.toPrecision(2)', 'Infinity'],
  ['Number.NEGATIVE_INFINITY.toPrecision(2)', '-Infinity'],
  ['(0).toPrecision(1)', '0'],
  ['(0).toPrecision(3)', '0.00'],
  ['(-0).toPrecision(2)', '0.0'],
  ['(0).toPrecision(21)', '0.00000000000000000000'],
  ['(1).toPrecision(1)', '1'],
  ['(1).toPrecision(3)', '1.00'],
  ['(-1).toPrecision(3)', '-1.00'],
  ['(1.5).toPrecision(1)', '2'],
  ['(-1.5).toPrecision(1)', '-2'],
  ['(123).toPrecision(1)', '1e+2'],
  ['(123).toPrecision(2)', '1.2e+2'],
  ['(123).toPrecision(3)', '123'],
  ['(123).toPrecision(4)', '123.0'],
  ['(123.456).toPrecision(5)', '123.46'],
  ['(0.9999).toPrecision(2)', '1.0'],
  ['(0.000001).toPrecision(1)', '0.000001'],
  ['(0.0000001).toPrecision(1)', '1e-7'],
  ['(9.9e-7).toPrecision(1)', '0.000001'],
  ['(0.00001).toPrecision(2)', '0.000010'],
  ['(1e-6).toPrecision(2)', '0.0000010'],
  ['(1e-7).toPrecision(2)', '1.0e-7'],
  ['(1e21).toPrecision(3)', '1.00e+21'],
  ['(9.999e20).toPrecision(3)', '1.00e+21'],
  ['(1e21).toPrecision(21)', '1.00000000000000000000e+21'],
  ['(0.1).toPrecision(21)', '0.100000000000000005551'],
  ['Number.MAX_VALUE.toPrecision(3)', '1.80e+308'],
  ['Number.MIN_VALUE.toPrecision(3)', '4.94e-324'],
  ['(1).toPrecision("2")', '1.0'],
  ['(1).toPrecision(2.9)', '1.0'],
  ['Number.prototype.toPrecision(2)', '0.0'],
  ['(new Number(123.456)).toPrecision(5)', '123.46'],
]);

const tests = [
  {
    name: 'Number.prototype.toFixed formats exact double values with ES5 round-half-up, carry, and signed zero handling',
    run() {
      assertTable(TO_FIXED_CASES);
    },
  },
  {
    name: 'Number.prototype.toExponential formats exact double values, omitted fractionDigits, and unpadded signed exponents',
    run() {
      assertTable(TO_EXPONENTIAL_CASES);
    },
  },
  {
    name: 'Number.prototype.toPrecision selects fixed versus exponential notation from the post-rounding exponent',
    run() {
      assertTable(TO_PRECISION_CASES);
    },
  },
  {
    name: 'Number.prototype.toFixed accepts 0 through 20 fraction digits and throws a guest RangeError outside that range',
    run() {
      for (let digits = 0; digits <= 20; digits += 1) {
        assertSame(
          typeof run(`(1).toFixed(${digits});`),
          'string',
          `toFixed(${digits})`,
        );
      }

      assertSame(throwsName('(1).toFixed(-1)'), 'RangeError');
      assertSame(throwsName('(1).toFixed(21)'), 'RangeError');
      assertSame(throwsName('(1).toFixed(Infinity)'), 'RangeError');
      assertSame(throwsName('(1).toFixed(-Infinity)'), 'RangeError');
      assertSame(throwsName('(1).toFixed("21")'), 'RangeError');
      // ES5 15.7.4.5 checks the range before it looks at the value, so even
      // NaN and the infinities throw for an out-of-range fractionDigits.
      assertSame(throwsName('NaN.toFixed(21)'), 'RangeError');
      assertSame(
        throwsName('Number.POSITIVE_INFINITY.toFixed(-1)'),
        'RangeError',
      );
      // ToInteger(NaN) is 0, which is in range.
      assertSame(throwsName('NaN.toFixed(NaN)'), '<no throw>');
    },
  },
  {
    name: 'Number.prototype.toExponential accepts 0 through 20 fraction digits, and its NaN/Infinity results precede the range check',
    run() {
      for (let digits = 0; digits <= 20; digits += 1) {
        assertSame(
          typeof run(`(1).toExponential(${digits});`),
          'string',
          `toExponential(${digits})`,
        );
      }

      assertSame(throwsName('(1).toExponential(-1)'), 'RangeError');
      assertSame(throwsName('(1).toExponential(21)'), 'RangeError');
      assertSame(throwsName('(1).toExponential(Infinity)'), 'RangeError');
      assertSame(throwsName('(1).toExponential(-Infinity)'), 'RangeError');
      // ES5 15.7.4.6 returns for NaN and the infinities in steps 3-6, before
      // the step 7 range check, so these do not throw at all.
      assertSame(run('NaN.toExponential(-1);'), 'NaN');
      assertSame(run('NaN.toExponential(101);'), 'NaN');
      assertSame(
        run('Number.POSITIVE_INFINITY.toExponential(-1);'),
        'Infinity',
      );
      assertSame(
        run('Number.NEGATIVE_INFINITY.toExponential(99);'),
        '-Infinity',
      );
    },
  },
  {
    name: 'Number.prototype.toPrecision accepts 1 through 21 digits, and undefined precision plus NaN/Infinity results precede the range check',
    run() {
      for (let precision = 1; precision <= 21; precision += 1) {
        assertSame(
          typeof run(`(1).toPrecision(${precision});`),
          'string',
          `toPrecision(${precision})`,
        );
      }

      assertSame(throwsName('(1).toPrecision(0)'), 'RangeError');
      assertSame(throwsName('(1).toPrecision(22)'), 'RangeError');
      assertSame(throwsName('(1).toPrecision(-1)'), 'RangeError');
      assertSame(throwsName('(1).toPrecision(NaN)'), 'RangeError');
      assertSame(throwsName('(1).toPrecision(Infinity)'), 'RangeError');
      assertSame(throwsName('(1).toPrecision(-Infinity)'), 'RangeError');
      assertSame(throwsName('(1).toPrecision(0.5)'), 'RangeError');
      // ES5 15.7.4.7 returns in steps 2-7 for undefined precision, NaN, and
      // the infinities, all before the step 8 range check.
      assertSame(run('NaN.toPrecision(0);'), 'NaN');
      assertSame(run('Number.POSITIVE_INFINITY.toPrecision(0);'), 'Infinity');
      assertSame(run('Number.NEGATIVE_INFINITY.toPrecision(22);'), '-Infinity');
      assertSame(throwsName('NaN.toPrecision()'), '<no throw>');
    },
  },
  {
    name: 'the formatting methods accept number primitives, matching wrappers, and foreign-realm Number wrappers',
    run() {
      assertSame(run('(1.5).toFixed(2);'), '1.50');
      assertSame(run('(new Number(1.5)).toExponential(1);'), '1.5e+0');
      assertSame(run('Number.prototype.toPrecision(1);'), '0');

      const first = createRealm();
      const second = createRealm();

      evaluateScript(first, 'var boxed = new Number(1.5);');

      const boxed = first.globalObject.get('boxed');

      second.globalObject.defineOwnProperty('foreign', {
        value: boxed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(second, 'Number.prototype.toFixed.call(foreign, 2);')
          .value,
        '1.50',
      );
      assertSame(
        evaluateScript(
          second,
          'Number.prototype.toExponential.call(foreign, 1);',
        ).value,
        '1.5e+0',
      );
      assertSame(
        evaluateScript(second, 'Number.prototype.toPrecision.call(foreign, 2);')
          .value,
        '1.5',
      );
    },
  },
  {
    name: 'the formatting methods reject incompatible receivers with a guest TypeError',
    run() {
      for (const method of ['toFixed', 'toExponential', 'toPrecision']) {
        // Without this guard the receiver assertions below would also hold
        // for a Number.prototype that has no such method at all.
        assertSame(run(`typeof Number.prototype.${method};`), 'function');

        for (const receiver of [
          '"5"',
          'true',
          'new Boolean(true)',
          'new String("5")',
          'undefined',
          'null',
          '{}',
          '[]',
        ]) {
          assertSame(
            throwsName(`Number.prototype.${method}.call(${receiver}, 2)`),
            'TypeError',
            `${method} on ${receiver}`,
          );
        }
      }

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'Number.prototype.toFixed.call({}, 2);',
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
    name: 'the formatting methods validate the receiver before coercing their argument',
    run() {
      for (const method of ['toFixed', 'toExponential', 'toPrecision']) {
        assertSame(run(`typeof Number.prototype.${method};`), 'function');
        assertSame(
          run(
            'var order = ""; var name; ' +
              `try { Number.prototype.${method}.call({}, ` +
              '{ valueOf: function () { order += "argument"; return 2; } }); } ' +
              'catch (error) { name = error.name; } ' +
              'name + ":" + order;',
          ),
          'TypeError:',
          method,
        );
      }
    },
  },
  {
    name: 'the formatting methods coerce their argument with ToInteger through valueOf and propagate guest errors by identity',
    run() {
      assertSame(
        run(
          'var order = ""; ' +
            'var digits = { valueOf: function () { order += "v"; return 2; }, ' +
            'toString: function () { order += "t"; return "3"; } }; ' +
            '(1).toFixed(digits) + ":" + order;',
        ),
        '1.00:v',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var digits = { valueOf: function () { order += "v"; return 1; }, ' +
            'toString: function () { order += "t"; return "3"; } }; ' +
            '(1).toExponential(digits) + ":" + order;',
        ),
        '1.0e+0:v',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var digits = { valueOf: function () { order += "v"; return 2; }, ' +
            'toString: function () { order += "t"; return "3"; } }; ' +
            '(1).toPrecision(digits) + ":" + order;',
        ),
        '1.0:v',
      );

      for (const method of ['toFixed', 'toExponential', 'toPrecision']) {
        assertSame(
          run(
            'var thrown = new Error("boom"); var caught; var order = ""; ' +
              'var digits = { valueOf: function () { order += "v"; throw thrown; } }; ' +
              `try { (1).${method}(digits); } catch (error) { caught = error; } ` +
              '(caught === thrown) + ":" + order;',
          ),
          'true:v',
          method,
        );
      }
    },
  },
  {
    name: 'the formatting methods never consult a guest toString and never mutate the receiver',
    run() {
      assertSame(
        run(
          'Number.prototype.toString = function () { return "OVERRIDDEN"; }; ' +
            '(1e21).toFixed(2) + "|" + (1.5).toPrecision(2) + "|" + (11.2).toExponential();',
        ),
        '1e+21|1.5|1.12e+1',
      );
      assertSame(
        run(
          'var boxed = new Number(1e21); ' +
            'boxed.toString = function () { return "OVERRIDDEN"; }; ' +
            'boxed.toFixed(2);',
        ),
        '1e+21',
      );
      assertSame(
        run(
          'var boxed = new Number(1.5); ' +
            'boxed.toFixed(3); boxed.toExponential(3); boxed.toPrecision(3); ' +
            'boxed.valueOf() + ":" + boxed.hasOwnProperty("toFixed");',
        ),
        '1.5:false',
      );
    },
  },
  {
    name: 'the formatting methods carry ES5 lengths, names, and property descriptors',
    run() {
      for (const method of ['toFixed', 'toExponential', 'toPrecision']) {
        assertSame(run(`Number.prototype.${method}.length;`), 1, method);
        assertSame(run(`Number.prototype.${method}.name;`), method);
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(Number.prototype, "${method}"); ` +
              'd.writable + ":" + d.enumerable + ":" + d.configurable;',
          ),
          'true:false:true',
          method,
        );
        assertSame(
          run(`typeof Number.prototype.${method};`),
          'function',
          method,
        );
      }
    },
  },
];

export default tests;
