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
 * @param {readonly [string, unknown][]} cases
 * @returns {void}
 */
function assertExpressions(cases) {
  for (const [source, expected] of cases) {
    assertSame(run(`${source};`), expected, source);
  }
}

/**
 * The ES5 15.1 global function properties are `{ [[Writable]]: true,
 * [[Enumerable]]: false, [[Configurable]]: true }`, are not constructors, and
 * have no `prototype` property.
 *
 * @param {string} name
 * @param {number} length
 * @returns {void}
 */
function assertGlobalFunction(name, length) {
  assertSame(run(`typeof ${name};`), 'function', name);
  assertSame(run(`${name}.length;`), length, name);
  assertSame(run(`${name}.name;`), name, name);
  assertSame(run(`${name}.prototype;`), undefined, name);
  assertSame(
    run(`try { new ${name}("1"); } catch (e) { e instanceof TypeError; }`),
    true,
    name,
  );

  const descriptor = `Object.getOwnPropertyDescriptor(this, "${name}")`;

  assertSame(run(`${descriptor}.writable;`), true, name);
  assertSame(run(`${descriptor}.enumerable;`), false, name);
  assertSame(run(`${descriptor}.configurable;`), true, name);
}

/** Every code unit ES5 7.2/7.3 makes a `StrWhiteSpaceChar`. */
const WHITESPACE = [
  '\u0009',
  '\u000b',
  '\u000c',
  '\u0020',
  '\u00a0',
  '\ufeff',
  '\u000a',
  '\u000d',
  '\u2028',
  '\u2029',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200a',
  '\u202f',
  '\u205f',
  '\u3000',
];

/**
 * @param {string} unit
 * @returns {string}
 */
function escapeUnit(unit) {
  const code = unit.charCodeAt(0).toString(16).padStart(4, '0');

  return `\\u${code}`;
}

const tests = [
  {
    name: 'the four numeric global functions have their ES5 names, lengths, and global property attributes',
    run() {
      assertGlobalFunction('parseInt', 2);
      assertGlobalFunction('parseFloat', 1);
      assertGlobalFunction('isNaN', 1);
      assertGlobalFunction('isFinite', 1);
    },
  },
  {
    name: 'parseInt reads a radix-10 integer prefix and stops at the first non-digit',
    run() {
      assertExpressions([
        ['parseInt("42")', 42],
        ['parseInt("42abc")', 42],
        ['parseInt("42.9")', 42],
        ['parseInt("1e3")', 1],
        ['parseInt("+7")', 7],
        ['parseInt("-7")', -7],
        ['parseInt("08")', 8],
        ['parseInt("0009")', 9],
        // No digits at all, and no digits after a sign, are both NaN.
        ['parseInt("")', NaN],
        ['parseInt("abc")', NaN],
        ['parseInt("-")', NaN],
        ['parseInt("+")', NaN],
        ['parseInt(".5")', NaN],
        ['parseInt("Infinity")', NaN],
        ['parseInt()', NaN],
        // A zero magnitude keeps the sign: -0, not +0.
        ['parseInt("-0")', -0],
        ['1 / parseInt("-0")', -Infinity],
        ['1 / parseInt("-000")', -Infinity],
        ['1 / parseInt("0")', Infinity],
        ['1 / parseInt("+0")', Infinity],
      ]);
    },
  },
  {
    name: 'parseInt strips leading whitespace but never trailing or interior whitespace',
    run() {
      for (const unit of WHITESPACE) {
        const escaped = escapeUnit(unit);

        assertSame(run(`parseInt("${escaped}1");`), 1, escaped);
        assertSame(
          run(`parseInt("${escaped}${escaped}${escaped}1");`),
          1,
          escaped,
        );
        assertSame(run(`parseInt("${escaped}");`), NaN, escaped);
      }

      assertExpressions([
        ['parseInt("  42  ")', 42],
        // U+180E stopped being a space separator in Unicode 6.3, so it is not
        // StrWhiteSpaceChar and leaves no digits to read.
        ['parseInt("\\u180e1")', NaN],
        ['parseInt("1 2")', 1],
      ]);
    },
  },
  {
    name: 'parseInt honours the 0x prefix exactly when the radix is unset or 16',
    run() {
      assertExpressions([
        ['parseInt("0x1F")', 31],
        ['parseInt("0X1f")', 31],
        ['parseInt("  0X1F  ")', 31],
        ['parseInt("-0x10")', -16],
        ['parseInt("+0x10")', 16],
        ['parseInt("0x1F", 16)', 31],
        ['parseInt("0x1F", undefined)', 31],
        ['parseInt("0x1F", 0)', 31],
        // With an explicit non-16 radix the prefix is not stripped, so "0"
        // is the whole digit run.
        ['parseInt("0x10", 10)', 0],
        ['parseInt("0x10", 8)', 0],
        // The prefix with nothing after it leaves an empty digit run.
        ['parseInt("0x")', NaN],
        ['parseInt("0x", 16)', NaN],
        ['parseInt("0xg")', NaN],
      ]);
    },
  },
  {
    name: 'parseInt applies ToInt32 to the radix and rejects every radix outside 2..36',
    run() {
      assertExpressions([
        ['parseInt("11", 2)', 3],
        // ToInt32 truncates toward zero, so 2.9 is radix 2.
        ['parseInt("11", 2.9)', 3],
        ['parseInt("11", "2")', 3],
        // ToInt32 wraps modulo 2^32: 4294967298 is 2.
        ['parseInt("11", 4294967298)', 3],
        // ToInt32(NaN) and ToInt32(undefined) are +0, which means "unset".
        ['parseInt("11", NaN)', 11],
        ['parseInt("11", null)', 11],
        ['parseInt("11", "")', 11],
        ['parseInt("1010", 2)', 10],
        ['parseInt("777", 8)', 511],
        ['parseInt("zz", 36)', 1295],
        ['parseInt("ZZ", 36)', 1295],
        ['parseInt("1z", 36)', 71],
        // Digits at or above the radix end the run.
        ['parseInt("129", 8)', 10],
        ['parseInt("012", 2)', 1],
        ['parseInt("1", 1)', NaN],
        ['parseInt("1", 37)', NaN],
        ['parseInt("111", -1)', NaN],
        ['parseInt("1", 1.9)', NaN],
      ]);
    },
  },
  {
    name: 'parseInt computes the exact Number value of the digit run, not an accumulated approximation',
    run() {
      assertExpressions([
        ['parseInt("9007199254740993")', 9007199254740992],
        ['parseInt("10000000000000000000000")', 1e22],
        ['parseInt("ffffffffffffffffffff", 16)', 1.2089258196146292e24],
        [
          'parseInt("11111111111111111111111111111111111111111111111111111111", 2)',
          72057594037927940,
        ],
        [
          'parseInt("123456789012345678901234567890", 10)',
          1.2345678901234568e29,
        ],
      ]);
    },
  },
  {
    name: 'parseInt stops exact non-decimal accumulation once the result must be Infinity',
    run() {
      const realm = createRealm();

      realm.globalObject.defineOwnProperty('digits', {
        value: '1'.repeat(200000),
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(evaluateScript(realm, 'parseInt(digits, 2);').value, Infinity);
    },
  },
  {
    name: 'parseInt coerces its string argument with ToString before it reads the radix',
    run() {
      assertExpressions([
        ['parseInt(42)', 42],
        ['parseInt(true)', NaN],
        ['parseInt(null)', NaN],
        ['parseInt(undefined)', NaN],
        ['parseInt({ toString: function () { return "17"; } })', 17],
        ['parseInt(new String("21"))', 21],
        // ToString prefers toString over valueOf.
        [
          'parseInt({ toString: function () { return "3"; }, valueOf: function () { return "9"; } })',
          3,
        ],
      ]);

      assertSame(
        run(
          'var order = ""; ' +
            'parseInt( ' +
            '  { toString: function () { order += "s"; return "11"; } }, ' +
            '  { valueOf: function () { order += "r"; return 2; } } ' +
            ') + ":" + order;',
        ),
        '3:sr',
      );
      assertSame(
        run(
          'try { parseInt({ toString: function () { throw new RangeError("x"); } }, 10); } ' +
            'catch (e) { e instanceof RangeError; }',
        ),
        true,
      );
    },
  },
  {
    name: 'parseFloat reads the longest StrDecimalLiteral prefix and never reads hexadecimal',
    run() {
      assertExpressions([
        ['parseFloat("3.14")', 3.14],
        ['parseFloat("3.14abc")', 3.14],
        ['parseFloat("  3.14  ")', 3.14],
        ['parseFloat(".5")', 0.5],
        ['parseFloat("5.")', 5],
        ['parseFloat("-1.5")', -1.5],
        ['parseFloat("+1.5")', 1.5],
        ['parseFloat("1e3")', 1000],
        ['parseFloat("1E3")', 1000],
        ['parseFloat("1e+3")', 1000],
        ['parseFloat("1e-3")', 0.001],
        // A truncated exponent is not part of the longest valid prefix.
        ['parseFloat("1e")', 1],
        ['parseFloat("1e+")', 1],
        ['parseFloat("1.5e")', 1.5],
        // StrDecimalLiteral has no hexadecimal form, so only the leading 0
        // is read.
        ['parseFloat("0x10")', 0],
        ['parseFloat("0X10")', 0],
        ['parseFloat("Infinity")', Infinity],
        ['parseFloat("-Infinity")', -Infinity],
        ['parseFloat("+Infinity")', Infinity],
        ['parseFloat("Infinityx")', Infinity],
        ['parseFloat("Infinit")', NaN],
        ['parseFloat("")', NaN],
        ['parseFloat("abc")', NaN],
        ['parseFloat(".")', NaN],
        ['parseFloat("-.")', NaN],
        ['parseFloat("+")', NaN],
        ['parseFloat("e3")', NaN],
        ['parseFloat()', NaN],
        ['parseFloat("-0")', -0],
        ['1 / parseFloat("-0")', -Infinity],
        ['1 / parseFloat("-0.0")', -Infinity],
        ['1 / parseFloat("0")', Infinity],
      ]);
    },
  },
  {
    name: 'parseFloat strips only leading whitespace and coerces its argument with ToString',
    run() {
      for (const unit of WHITESPACE) {
        const escaped = escapeUnit(unit);

        assertSame(run(`parseFloat("${escaped}1.5");`), 1.5, escaped);
        assertSame(run(`parseFloat("${escaped}");`), NaN, escaped);
      }

      assertExpressions([
        ['parseFloat("\\u180e1.5")', NaN],
        ['parseFloat(1.5)', 1.5],
        ['parseFloat(true)', NaN],
        ['parseFloat(null)', NaN],
        ['parseFloat(new String("2.5"))', 2.5],
        ['parseFloat({ toString: function () { return "6.25"; } })', 6.25],
      ]);

      assertSame(
        run(
          'try { parseFloat({ toString: function () { throw new TypeError("x"); } }); } ' +
            'catch (e) { e instanceof TypeError; }',
        ),
        true,
      );
    },
  },
  {
    name: 'isNaN and isFinite classify the ToNumber result of their argument',
    run() {
      assertExpressions([
        ['isNaN(NaN)', true],
        ['isNaN(0)', false],
        ['isNaN(Infinity)', false],
        ['isNaN(-Infinity)', false],
        ['isNaN("1")', false],
        ['isNaN("abc")', true],
        ['isNaN("")', false],
        ['isNaN(undefined)', true],
        ['isNaN(null)', false],
        ['isNaN(true)', false],
        ['isNaN()', true],
        ['isNaN(new Number(NaN))', true],
        ['isNaN({})', true],
        ['isNaN([])', false],

        ['isFinite(0)', true],
        ['isFinite(NaN)', false],
        ['isFinite(Infinity)', false],
        ['isFinite(-Infinity)', false],
        ['isFinite("1")', true],
        ['isFinite("abc")', false],
        ['isFinite("")', true],
        ['isFinite(undefined)', false],
        ['isFinite(null)', true],
        ['isFinite(true)', true],
        ['isFinite()', false],
        ['isFinite("Infinity")', false],
        ['isFinite(new Number(5))', true],
      ]);

      assertSame(
        run(
          'try { isNaN({ valueOf: function () { throw new RangeError("x"); } }); } ' +
            'catch (e) { e instanceof RangeError; }',
        ),
        true,
      );
      assertSame(
        run(
          'try { isFinite({ valueOf: function () { throw new RangeError("x"); } }); } ' +
            'catch (e) { e instanceof RangeError; }',
        ),
        true,
      );
    },
  },
  {
    name: 'Number, isNaN, and isFinite do not trim U+180E as whitespace',
    run() {
      assertExpressions([
        ['Number("\\u180e")', NaN],
        ['Number("\\u180e1")', NaN],
        ['isNaN("\\u180e")', true],
        ['isNaN("\\u180e1")', true],
        ['isFinite("\\u180e")', false],
        ['isFinite("\\u180e1")', false],
      ]);
    },
  },
  {
    name: 'Number trims every ES5 boundary whitespace member around valid and invalid forms',
    run() {
      for (const unit of WHITESPACE) {
        const escaped = escapeUnit(unit);

        for (const [value, expected] of [
          ['123.5', 123.5],
          ['0x2a', 42],
          ['-Infinity', -Infinity],
          ['12x', NaN],
          ['1e', NaN],
        ]) {
          assertSame(
            run(`Number("${escaped}${value}${escaped}");`),
            expected,
            `${escaped}${value}${escaped}`,
          );
        }

        assertSame(run(`Number("1${escaped}1");`), NaN, `${escaped} interior`);
      }

      const longWhitespace = WHITESPACE.join('').repeat(256);
      const longWhitespaceSource = [...longWhitespace].map(escapeUnit).join('');

      for (const [value, expected] of [
        ['123.5', 123.5],
        ['0x2a', 42],
        ['-Infinity', -Infinity],
        ['12x', NaN],
        ['1e', NaN],
      ]) {
        assertSame(
          run(
            `Number("${longWhitespaceSource}${value}${longWhitespaceSource}");`,
          ),
          expected,
          `long whitespace around ${value}`,
        );
      }

      assertSame(
        run(`Number("1${longWhitespaceSource}1");`),
        NaN,
        'long whitespace interior',
      );
    },
  },
  {
    name: 'the numeric globals are realm-local functions',
    run() {
      const first = createRealm();
      const second = createRealm();

      for (const name of ['parseInt', 'parseFloat', 'isNaN', 'isFinite']) {
        assertSame(first.globalObject.get(name) === undefined, false, name);
        assertSame(
          first.globalObject.get(name) === second.globalObject.get(name),
          false,
          name,
        );
      }
    },
  },
];

export default tests;
