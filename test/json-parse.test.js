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
 * Builds a realm whose global `text` holds `jsonText` verbatim.
 *
 * Handing the JSON text to the guest through a binding rather than through a
 * string literal inside the evaluated source keeps exactly one layer of
 * escaping in play — the host literal in this file — so a test that means to
 * feed the parser a backslash is not silently feeding it something else.
 *
 * @param {string} jsonText
 * @returns {import('../src/runtime/realm.js').Realm}
 */
function realmWithText(jsonText) {
  const realm = createRealm();

  realm.globalObject.defineOwnProperty('text', {
    value: jsonText,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return realm;
}

/**
 * Parses `jsonText` and evaluates `expression` with the result bound to
 * `value`.
 *
 * @param {string} jsonText
 * @param {string} [expression='value']
 * @returns {unknown}
 */
function parseAnd(jsonText, expression = 'value') {
  return evaluateScript(
    realmWithText(jsonText),
    `var value = JSON.parse(text); ${expression};`,
  ).value;
}

/**
 * @param {readonly [string, unknown][]} cases
 * @returns {void}
 */
function assertParses(cases) {
  for (const [jsonText, expected] of cases) {
    assertSame(parseAnd(jsonText), expected, jsonText);
  }
}

/**
 * @param {readonly [string, string, unknown][]} cases
 * @returns {void}
 */
function assertParsesAnd(cases) {
  for (const [jsonText, expression, expected] of cases) {
    assertSame(
      parseAnd(jsonText, expression),
      expected,
      `${jsonText} -> ${expression}`,
    );
  }
}

/**
 * @param {readonly string[]} texts
 * @returns {void}
 */
function assertSyntaxErrors(texts) {
  for (const jsonText of texts) {
    assertSame(
      evaluateScript(
        realmWithText(jsonText),
        'try { JSON.parse(text); "no-throw"; } catch (e) { ' +
          'e instanceof SyntaxError ? "SyntaxError" : "wrong:" + e.name; }',
      ).value,
      'SyntaxError',
      jsonText,
    );
  }
}

const tests = [
  {
    name: 'the JSON object has its ES5 shape, class, and property attributes',
    run() {
      assertExpressions([
        ['typeof JSON', 'object'],
        ['Object.prototype.toString.call(JSON)', '[object JSON]'],
        ['Object.getPrototypeOf(JSON) === Object.prototype', true],
        ['typeof JSON.parse', 'function'],
        ['JSON.parse.length', 2],
        ['JSON.parse.name', 'parse'],
        ['JSON.parse.prototype', undefined],
        ['Object.getOwnPropertyDescriptor(this, "JSON").writable', true],
        ['Object.getOwnPropertyDescriptor(this, "JSON").enumerable', false],
        ['Object.getOwnPropertyDescriptor(this, "JSON").configurable', true],
        ['Object.getOwnPropertyDescriptor(JSON, "parse").writable', true],
        ['Object.getOwnPropertyDescriptor(JSON, "parse").enumerable', false],
        ['Object.getOwnPropertyDescriptor(JSON, "parse").configurable', true],
        // JSON is a plain object: not callable, and not a constructor.
        ['try { JSON(); } catch (e) { e instanceof TypeError; }', true],
        [
          'try { new JSON.parse("1"); } catch (e) { e instanceof TypeError; }',
          true,
        ],
      ]);
    },
  },
  {
    name: 'JSON.parse reads the JSON primitive grammar',
    run() {
      assertParses([
        ['null', null],
        ['true', true],
        ['false', false],
        ['0', 0],
        ['-0', -0],
        ['1', 1],
        ['-1', -1],
        ['1.5', 1.5],
        ['-1.5', -1.5],
        ['1e3', 1000],
        ['1E3', 1000],
        ['1e+3', 1000],
        ['1e-3', 0.001],
        ['1.5e2', 150],
        ['0.5', 0.5],
        ['-0.0', -0],
        ['123456789012345678901234567890', 1.2345678901234568e29],
        ['1e400', Infinity],
        ['-1e400', -Infinity],
        ['1e-400', 0],
        ['9007199254740993', 9007199254740992],
        ['1e-320', 1e-320],
        ['""', ''],
        ['"abc"', 'abc'],
        // JSONWhiteSpace may surround the value.
        [' \t\r\n1 \t\r\n', 1],
        ['\n1\n', 1],
      ]);

      assertParsesAnd([
        ['"a"', 'typeof value', 'string'],
        ['-0', '1 / value', -Infinity],
        ['0.1', 'value + 0.2', 0.1 + 0.2],
      ]);
    },
  },
  {
    name: 'JSON.parse reads JSONString escapes and rejects raw control characters',
    run() {
      assertParses([
        ['"a\\"b"', 'a"b'],
        ['"a\\\\b"', 'a\\b'],
        ['"a\\/b"', 'a/b'],
        ['"\\b\\f\\n\\r\\t"', '\b\f\n\r\t'],
        ['"\\u0041"', 'A'],
        ['"\\u00e9"', '\u00e9'],
        ['"\\u00E9"', '\u00e9'],
        ['"\\uD83D\\uDE00"', '\ud83d\ude00'],
        ['"\\u005c"', '\\'],
        // U+007F is not a JSON control character, so it may appear raw.
        ['"\u007f"', '\u007f'],
        ['" "', ' '],
        ['"\u00e9"', '\u00e9'],
        // Escaped and raw supplementary characters agree.
        ['"\ud83d\ude00"', '\ud83d\ude00'],
      ]);

      assertParsesAnd([
        // A lone surrogate escape is well-formed JSON text.
        ['"\\ud800"', 'value.length', 1],
        ['"\\ud800"', 'value.charCodeAt(0)', 0xd800],
      ]);

      assertSyntaxErrors([
        // Raw control characters below U+0020 must be escaped.
        '"\u0000"',
        '"\u001f"',
        '"a\nb"',
        '"a\tb"',
        '"a\rb"',
        // Escapes JSON does not have, even though JavaScript does.
        '"\\x41"',
        '"\\v"',
        '"\\0"',
        '"\\\'"',
        '"\\a"',
        '"\\ "',
        // A backslash at the very end of the text.
        '"\\',
        // Truncated or non-hexadecimal \u escapes.
        '"\\u"',
        '"\\u00"',
        '"\\u00g0"',
        '"\\u 041"',
        // Unterminated strings, and single quotes.
        '"abc',
        "'abc'",
      ]);
    },
  },
  {
    name: 'JSON.parse rejects the number forms JSON does not have',
    run() {
      assertSyntaxErrors([
        // A leading zero may not be followed by more digits.
        '01',
        '00',
        '-01',
        // A leading "+" is not part of JSONNumber.
        '+1',
        // The fraction and the exponent each need at least one digit.
        '1.',
        '.1',
        '1e',
        '1e+',
        '1.e3',
        '1.2e',
        // Hex and legacy octal literals are JavaScript, not JSON.
        '0x10',
        '0X10',
        // Neither are these.
        'Infinity',
        '-Infinity',
        'NaN',
        'undefined',
        'True',
        'nul',
        'nulll',
        // A bare or detached minus sign.
        '-',
        '- 1',
        '--1',
      ]);
    },
  },
  {
    name: 'JSON.parse reads objects and arrays, and rejects malformed ones',
    run() {
      assertParsesAnd([
        ['[]', 'value.length', 0],
        ['[]', 'Array.isArray(value)', true],
        ['[1,2,3]', 'value.length', 3],
        ['[1,2,3]', 'value[1]', 2],
        ['[[1],[2]]', 'value[1][0]', 2],
        [' [ 1 , 2 ] ', 'value[1]', 2],
        ['[null]', 'value[0]', null],
        ['[[]]', 'value[0].length', 0],
        ['{}', 'value.a', undefined],
        ['{"a":1}', 'value.a', 1],
        ['{"a":{"b":[1,2]}}', 'value.a.b[1]', 2],
        [' { "a" : 1 , "b" : 2 } ', 'value.b', 2],
        // A duplicate key keeps the last value.
        ['{"a":1,"a":2}', 'value.a', 2],
        // The empty key is a key like any other.
        ['{"":1}', 'value[""]', 1],
        // Array elements are real index properties, not inherited ones.
        ['[1]', 'value.hasOwnProperty("0")', true],
        // Parsed properties are ordinary: writable, enumerable, configurable.
        [
          '{"a":1}',
          'Object.getOwnPropertyDescriptor(value, "a").enumerable',
          true,
        ],
        [
          '{"a":1}',
          'Object.getOwnPropertyDescriptor(value, "a").writable',
          true,
        ],
        [
          '{"a":1}',
          'Object.getOwnPropertyDescriptor(value, "a").configurable',
          true,
        ],
        // Objects and arrays get the standard prototypes of the parsing realm.
        ['{}', 'Object.getPrototypeOf(value) === Object.prototype', true],
        ['[]', 'Object.getPrototypeOf(value) === Array.prototype', true],
        // Key order follows the text.
        [
          '{"b":1,"a":2,"c":3}',
          'var keys = []; for (var k in value) { keys.push(k); } keys.join(",")',
          'b,a,c',
        ],
        // A key that shadows an Object.prototype property is still an own one.
        ['{"toString":1}', 'value.toString', 1],
        ['{"__proto__":1}', 'value.__proto__', 1],
      ]);

      assertSyntaxErrors([
        '',
        '   ',
        // Trailing commas, missing commas, and trailing content.
        '[1,]',
        '[,1]',
        '[1 2]',
        '[1,,2]',
        '{"a":1,}',
        '{,"a":1}',
        '1 2',
        '[] []',
        '{} 1',
        'null null',
        // Unbalanced brackets and braces.
        '[',
        ']',
        '[1',
        '{',
        '}',
        '{"a":1',
        '[1}',
        '{"a":1]',
        // Keys must be double-quoted strings.
        '{a:1}',
        "{'a':1}",
        '{"a"1}',
        '{"a":}',
        '{1:2}',
        '{"a"}',
        // JSONWhiteSpace is only tab, CR, LF, and space.
        '\u00a01',
        '\u20281',
        '\u000b1',
        '\u000c1',
        '\ufeff1',
        '\u30001',
      ]);
    },
  },
  {
    name: 'JSON.parse coerces its text with ToString before parsing',
    run() {
      assertExpressions([
        ['JSON.parse(1)', 1],
        ['JSON.parse(true)', true],
        ['JSON.parse(null)', null],
        ['JSON.parse(new String("[1]"))[0]', 1],
        ['JSON.parse({ toString: function () { return "7"; } })', 7],
        // ToString runs before the reviver is even inspected.
        [
          'try { JSON.parse({ toString: function () { throw new RangeError("x"); } }, 1); } ' +
            'catch (e) { e instanceof RangeError; }',
          true,
        ],
      ]);

      // "undefined" is not JSON text, and neither is the empty argument list.
      assertExpressions([
        [
          'try { JSON.parse(undefined); } catch (e) { e instanceof SyntaxError; }',
          true,
        ],
        ['try { JSON.parse(); } catch (e) { e instanceof SyntaxError; }', true],
      ]);
    },
  },
  {
    name: 'JSON.parse walks the result with a reviver',
    run() {
      assertExpressions([
        // The reviver sees every key, innermost first, and the root last.
        [
          'var seen = []; JSON.parse(\'{"a":{"b":1}}\', function (k, v) { ' +
            'seen.push(k); return v; }); seen.join("|")',
          'b|a|',
        ],
        // The root is visited with the empty key, on a wrapper object.
        [
          'var root; JSON.parse("1", function (k, v) { if (k === "") { root = this; } return v; }); ' +
            'typeof root',
          'object',
        ],
        [
          'var root; JSON.parse("1", function (k) { if (k === "") { root = this[""]; } return 0; }); root',
          1,
        ],
        ['JSON.parse("1", function (k, v) { return v * 2; })', 2],
        // Returning undefined deletes the property.
        [
          'var o = JSON.parse(\'{"a":1,"b":2}\', function (k, v) { ' +
            'return k === "a" ? undefined : v; }); ' +
            '("a" in o) + ":" + o.b',
          'false:2',
        ],
        // Deleting an array element leaves a hole, not a shorter array.
        [
          'var a = JSON.parse("[1,2,3]", function (k, v) { ' +
            'return k === "1" ? undefined : v; }); ' +
            'a.length + ":" + (1 in a)',
          '3:false',
        ],
        // The reviver can replace a whole subtree, and the replacement is not
        // itself walked.
        [
          'JSON.parse(\'{"a":{"b":1}}\', function (k, v) { ' +
            'return k === "a" ? "replaced" : v; }).a',
          'replaced',
        ],
        // Returning undefined for the root yields undefined.
        ['JSON.parse("1", function () { return undefined; })', undefined],
        // `this` inside the reviver is the holder of the visited key.
        [
          'JSON.parse(\'{"a":1}\', function (k, v) { ' +
            'return k === "a" ? typeof this : v; }).a',
          'object',
        ],
        // Array indices are passed as strings.
        [
          'var keys = []; JSON.parse("[10,20]", function (k, v) { ' +
            'keys.push(typeof k + ":" + k); return v; }); keys.join("|")',
          'string:0|string:1|string:',
        ],
        // A non-callable reviver is ignored, exactly as if it were absent.
        ['JSON.parse("[1,2]", 5).length', 2],
        ['JSON.parse("[1,2]", null)[0]', 1],
        ['JSON.parse("[1,2]", undefined)[0]', 1],
        ['JSON.parse("[1,2]", {})[1]', 2],
        // An abrupt completion from the reviver propagates unchanged.
        [
          'try { JSON.parse(\'{"a":1}\', function () { throw new RangeError("x"); }); } ' +
            'catch (e) { e instanceof RangeError; }',
          true,
        ],
      ]);
    },
  },
  {
    name: 'JSON.parse builds values in the parsing realm, not the calling one',
    run() {
      const realm = createRealm();
      const parsed = evaluateScript(realm, 'JSON.parse(\'{"a":[1]}\');').value;

      assertSame(
        evaluateScript(realm, 'JSON.parse(\'{"a":[1]}\') instanceof Object;')
          .value,
        true,
      );

      const other = createRealm();

      other.globalObject.defineOwnProperty('foreign', {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(other, 'foreign instanceof Object;').value,
        false,
      );
      assertSame(evaluateScript(other, 'foreign.a[0];').value, 1);
      assertSame(
        evaluateScript(other, 'Array.isArray(foreign.a);').value,
        true,
      );
    },
  },
];

export default tests;
