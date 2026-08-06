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
 * @param {readonly string[]} sources
 * @returns {void}
 */
function assertURIErrors(sources) {
  for (const source of sources) {
    assertSame(
      run(
        `try { ${source}; "no-throw"; } catch (e) { ` +
          'e instanceof URIError ? "URIError" : "wrong:" + e.name; }',
      ),
      'URIError',
      source,
    );
  }
}

/**
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
    run(`try { new ${name}("a"); } catch (e) { e instanceof TypeError; }`),
    true,
    name,
  );

  const descriptor = `Object.getOwnPropertyDescriptor(this, "${name}")`;

  assertSame(run(`${descriptor}.writable;`), true, name);
  assertSame(run(`${descriptor}.enumerable;`), false, name);
  assertSame(run(`${descriptor}.configurable;`), true, name);
}

const tests = [
  {
    name: 'the four URI functions and the two Annex B escape functions have their ES5 shapes',
    run() {
      assertGlobalFunction('encodeURI', 1);
      assertGlobalFunction('encodeURIComponent', 1);
      assertGlobalFunction('decodeURI', 1);
      assertGlobalFunction('decodeURIComponent', 1);
      assertGlobalFunction('escape', 1);
      assertGlobalFunction('unescape', 1);
    },
  },
  {
    name: 'encodeURI preserves uriReserved, uriUnescaped, and "#", and percent-encodes everything else',
    run() {
      assertExpressions([
        // uriReserved plus "#" survive encodeURI untouched.
        ['encodeURI(";/?:@&=+$,#")', ';/?:@&=+$,#'],
        // uriMark is part of uriUnescaped.
        ['encodeURI("-_.!~*\'()")', "-_.!~*'()"],
        [
          'encodeURI("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        ],
        ['encodeURI("abc ABC 123")', 'abc%20ABC%20123'],
        ['encodeURI("%")', '%25'],
        ['encodeURI("\\u0000")', '%00'],
        ['encodeURI("\\u007f")', '%7F'],
        ['encodeURI("")', ''],
        // Two-, three-, and four-octet UTF-8, with uppercase hex digits.
        ['encodeURI("\\u00e9")', '%C3%A9'],
        ['encodeURI("\\u07ff")', '%DF%BF'],
        ['encodeURI("\\u0800")', '%E0%A0%80'],
        ['encodeURI("\\u20ac")', '%E2%82%AC'],
        ['encodeURI("\\uffff")', '%EF%BF%BF'],
        ['encodeURI("\\ud800\\udc00")', '%F0%90%80%80'],
        ['encodeURI("\\udbff\\udfff")', '%F4%8F%BF%BF'],
        ['encodeURI("\\ud83d\\ude00")', '%F0%9F%98%80'],
      ]);
    },
  },
  {
    name: 'encodeURIComponent preserves only uriUnescaped, so every reserved character is escaped',
    run() {
      assertExpressions([
        [
          'encodeURIComponent(";/?:@&=+$,#")',
          '%3B%2F%3F%3A%40%26%3D%2B%24%2C%23',
        ],
        ['encodeURIComponent("-_.!~*\'()")', "-_.!~*'()"],
        ['encodeURIComponent("a b")', 'a%20b'],
        ['encodeURIComponent("\\u00e9")', '%C3%A9'],
        ['encodeURIComponent("\\ud83d\\ude00")', '%F0%9F%98%80'],
      ]);
    },
  },
  {
    name: 'both encode functions reject unpaired surrogates with a URIError',
    run() {
      assertURIErrors([
        'encodeURI("\\ud800")',
        'encodeURI("\\udbff")',
        // A lone trailing surrogate is rejected on sight.
        'encodeURI("\\udc00")',
        'encodeURI("\\udfff")',
        // A leading surrogate with a non-surrogate after it.
        'encodeURI("\\ud800a")',
        // A leading surrogate followed by another leading surrogate.
        'encodeURI("\\ud800\\ud800")',
        // A leading surrogate at the very end of the string.
        'encodeURI("a\\ud800")',
        'encodeURIComponent("\\ud800")',
        'encodeURIComponent("\\udc00")',
        'encodeURIComponent("a\\ud800b")',
      ]);

      // A valid pair around an invalid one still fails.
      assertURIErrors(['encodeURI("\\ud800\\udc00\\ud800")']);
    },
  },
  {
    name: 'decodeURI leaves the reserved set percent-encoded while decodeURIComponent decodes everything',
    run() {
      assertExpressions([
        ['decodeURI("%41")', 'A'],
        ['decodeURI("a%20b")', 'a b'],
        ['decodeURI("%00")', '\u0000'],
        // "%" itself is not in decodeURI's reservedURISet, so it decodes.
        ['decodeURI("%25")', '%'],
        ['decodeURIComponent("%25")', '%'],
        // The reserved set plus "#" stays encoded under decodeURI...
        [
          'decodeURI("%3B%2F%3F%3A%40%26%3D%2B%24%2C%23")',
          '%3B%2F%3F%3A%40%26%3D%2B%24%2C%23',
        ],
        // ...and the *original* text is preserved verbatim, including the
        // case of its hex digits.
        ['decodeURI("%2f")', '%2f'],
        ['decodeURI("%2F")', '%2F'],
        // ...while decodeURIComponent has an empty reserved set.
        [
          'decodeURIComponent("%3B%2F%3F%3A%40%26%3D%2B%24%2C%23")',
          ';/?:@&=+$,#',
        ],
        ['decodeURIComponent("%2f")', '/'],
        ['decodeURI("")', ''],
        ['decodeURI("plain")', 'plain'],
      ]);
    },
  },
  {
    name: 'decodeURI rebuilds multi-octet UTF-8 sequences, including surrogate pairs',
    run() {
      assertExpressions([
        ['decodeURI("%C3%A9")', '\u00e9'],
        ['decodeURI("%DF%BF")', '\u07ff'],
        ['decodeURI("%E0%A0%80")', '\u0800'],
        ['decodeURI("%E2%82%AC")', '\u20ac'],
        ['decodeURI("%EF%BF%BF")', '\uffff'],
        ['decodeURI("%F0%90%80%80")', '\ud800\udc00'],
        ['decodeURI("%F0%9F%98%80")', '\ud83d\ude00'],
        ['decodeURI("%F4%8F%BF%BF")', '\udbff\udfff'],
        ['decodeURIComponent("%F0%9F%98%80").length', 2],
        // Round trips both ways.
        [
          'decodeURI(encodeURI("a \\u20ac \\ud83d\\ude00 #?"))',
          'a \u20ac \ud83d\ude00 #?',
        ],
        [
          'decodeURIComponent(encodeURIComponent("a \\u20ac \\ud83d\\ude00 #?"))',
          'a \u20ac \ud83d\ude00 #?',
        ],
      ]);
    },
  },
  {
    name: 'decodeURI rejects malformed percent sequences and invalid UTF-8 with a URIError',
    run() {
      assertURIErrors([
        // Truncated or non-hexadecimal escapes.
        'decodeURI("%")',
        'decodeURI("%A")',
        'decodeURI("%GG")',
        'decodeURI("%2")',
        'decodeURI("a%")',
        'decodeURI("%%41")',
        'decodeURIComponent("%")',
        'decodeURIComponent("%zz")',
        // A continuation octet with no leading octet.
        'decodeURI("%80")',
        'decodeURI("%BF")',
        // A leading octet whose continuation octets are missing...
        'decodeURI("%C3")',
        'decodeURI("%E2%82")',
        'decodeURI("%F0%9F%98")',
        // ...or are not continuation octets at all.
        'decodeURI("%C3%28")',
        'decodeURI("%E2%28%AC")',
        'decodeURI("%E2%82%28")',
        // A continuation octet that is not even a percent escape.
        'decodeURI("%C3A9")',
        // Overlong encodings: C0 80 is not a legal encoding of U+0000.
        'decodeURI("%C0%80")',
        'decodeURI("%C1%BF")',
        'decodeURI("%E0%80%80")',
        'decodeURI("%E0%9F%BF")',
        'decodeURI("%F0%80%80%80")',
        'decodeURI("%F0%8F%BF%BF")',
        // UTF-8-encoded surrogate halves are not valid UTF-8.
        'decodeURI("%ED%A0%80")',
        'decodeURI("%ED%BF%BF")',
        // Beyond U+10FFFF, and the five/six octet forms that never existed.
        'decodeURI("%F4%90%80%80")',
        'decodeURI("%F5%80%80%80")',
        'decodeURI("%F8%88%80%80%80")',
        'decodeURI("%FE%80%80%80%80%80")',
        'decodeURI("%FF")',
      ]);
    },
  },
  {
    name: 'escape percent-encodes by code unit and uses the %uXXXX form above U+00FF',
    run() {
      assertExpressions([
        // The Annex B unescaped set: alphanumerics plus @*_+-./
        [
          'escape("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@*_+-./")',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@*_+-./',
        ],
        ['escape("abc ABC")', 'abc%20ABC'],
        // "~" is uriMark, so encodeURI keeps it, but escape does not.
        ['escape("~")', '%7E'],
        ['escape("!")', '%21'],
        ['escape("%")', '%25'],
        ['escape("\\u0000")', '%00'],
        ['escape("\\u00ff")', '%FF'],
        // 0x100 and above switch to the six-character %uXXXX form.
        ['escape("\\u0100")', '%u0100'],
        ['escape("\\u20ac")', '%u20AC'],
        ['escape("\\uffff")', '%uFFFF'],
        // escape never pairs surrogates: it works one code unit at a time.
        ['escape("\\ud83d\\ude00")', '%uD83D%uDE00'],
        ['escape("\\ud800")', '%uD800'],
        ['escape("")', ''],
      ]);
    },
  },
  {
    name: 'unescape decodes %uXXXX and %XX and leaves every incomplete escape verbatim',
    run() {
      assertExpressions([
        ['unescape("%41")', 'A'],
        ['unescape("%u0041")', 'A'],
        ['unescape("%u20AC")', '\u20ac'],
        ['unescape("%u20ac")', '\u20ac'],
        ['unescape("%2a%2A")', '**'],
        ['unescape("%u0041%42")', 'AB'],
        ['unescape("abc")', 'abc'],
        ['unescape("")', ''],
        // Incomplete or non-hexadecimal escapes are copied through unchanged.
        ['unescape("%")', '%'],
        ['unescape("%4")', '%4'],
        ['unescape("%zz")', '%zz'],
        ['unescape("%u041")', '%u041'],
        ['unescape("%u")', '%u'],
        ['unescape("%uZZZZ")', '%uZZZZ'],
        ['unescape("%%41")', '%A'],
        // A %uXXXX at the very end of the string still needs all six units.
        ['unescape("a%u004")', 'a%u004'],
        // escape/unescape round trip, surrogates included.
        [
          'unescape(escape("a \\u20ac \\ud83d\\ude00 ~!%"))',
          'a \u20ac \ud83d\ude00 ~!%',
        ],
      ]);
    },
  },
  {
    name: 'every URI and escape function coerces its argument with ToString',
    run() {
      assertExpressions([
        ['encodeURI()', 'undefined'],
        ['decodeURI()', 'undefined'],
        ['encodeURIComponent()', 'undefined'],
        ['decodeURIComponent()', 'undefined'],
        ['escape()', 'undefined'],
        ['unescape()', 'undefined'],
        ['escape(null)', 'null'],
        ['unescape(123)', '123'],
        ['encodeURI(new String("a b"))', 'a%20b'],
        ['encodeURI({ toString: function () { return "a b"; } })', 'a%20b'],
        ['escape(true)', 'true'],
        ['decodeURI(new String("%41"))', 'A'],
      ]);

      assertSame(
        run(
          'try { encodeURI({ toString: function () { throw new RangeError("x"); } }); } ' +
            'catch (e) { e instanceof RangeError; }',
        ),
        true,
      );
    },
  },
  {
    name: 'URIError instances thrown by the URI functions belong to the throwing realm',
    run() {
      const realm = createRealm();
      const thrown = evaluateScript(
        realm,
        'var caught; try { decodeURI("%"); } catch (e) { caught = e; } caught;',
      ).value;

      assertSame(
        evaluateScript(realm, 'caught instanceof URIError;').value,
        true,
      );
      assertSame(evaluateScript(realm, 'caught.name;').value, 'URIError');
      assertSame(
        evaluateScript(
          realm,
          'Object.getPrototypeOf(caught) === URIError.prototype;',
        ).value,
        true,
      );
      assertSame(typeof thrown, 'object');

      const other = createRealm();

      other.globalObject.defineOwnProperty('foreign', {
        value: thrown,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(other, 'foreign instanceof URIError;').value,
        false,
      );
    },
  },
];

export default tests;
