import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { UNICODE_VERSION } from '../src/builtins/unicode-case-data.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

/**
 * @param {unknown} target
 * @param {string} key
 * @returns {any}
 */
function property(target, key) {
  return /** @type {{ get: (key: string) => unknown }} */ (target).get(key);
}

/**
 * Every expected value in this suite is transcribed from the pinned Unicode
 * Character Database itself (the same files
 * `tools/unicode/generate-case-data.js` reads), never from a host
 * `String.prototype.toLowerCase`/`toUpperCase` call. The UCD lines each
 * expectation comes from are quoted in the comments so a reviewer can check
 * them against the pinned version without running anything.
 */
const tests = [
  {
    name: 'the case tables are generated from the Unicode version package.json pins',
    run() {
      assertSame(UNICODE_VERSION, '16.0.0');
    },
  },
  {
    name: 'toLowerCase and toUpperCase map the simple ASCII and Latin-1 mappings and leave uncased characters alone',
    run() {
      assertSame(run('"ABC".toLowerCase();'), 'abc');
      assertSame(run('"abc".toUpperCase();'), 'ABC');
      assertSame(run('"AbC dEf".toLowerCase();'), 'abc def');
      assertSame(run('"AbC dEf".toUpperCase();'), 'ABC DEF');
      assertSame(run('"".toLowerCase();'), '');
      assertSame(run('"".toUpperCase();'), '');
      assertSame(run('"0123!@#".toLowerCase();'), '0123!@#');
      assertSame(run('"0123!@#".toUpperCase();'), '0123!@#');
      assertSame(run('"\\u4e2d\\u6587".toLowerCase();'), '\u4e2d\u6587');
      assertSame(run('"\\u4e2d\\u6587".toUpperCase();'), '\u4e2d\u6587');

      // UnicodeData.txt: 00C0..00DE lowercase to 00E0..00FE (+0x20), with
      // 00D7 (MULTIPLICATION SIGN) uncased and therefore untouched.
      assertSame(
        run('"\\u00c0\\u00c9\\u00ce\\u00d5\\u00dc".toLowerCase();'),
        '\u00e0\u00e9\u00ee\u00f5\u00fc',
      );
      assertSame(
        run('"\\u00e0\\u00e9\\u00ee\\u00f5\\u00fc".toUpperCase();'),
        '\u00c0\u00c9\u00ce\u00d5\u00dc',
      );
      assertSame(run('"\\u00d7".toLowerCase();'), '\u00d7');
      assertSame(run('"\\u00f7".toUpperCase();'), '\u00f7');

      // `00B5;MICRO SIGN;...;039C;;039C` and
      // `00FF;LATIN SMALL LETTER Y WITH DIAERESIS;...;0178;;0178`.
      assertSame(run('"\\u00b5".toUpperCase();'), '\u039c');
      assertSame(run('"\\u00ff".toUpperCase();'), '\u0178');
      assertSame(run('"\\u0178".toLowerCase();'), '\u00ff');

      // `212A;KELVIN SIGN;...;;006B;` and `212B;ANGSTROM SIGN;...;;00E5;`.
      assertSame(run('"\\u212a".toLowerCase();'), 'k');
      assertSame(run('"\\u212b".toLowerCase();'), '\u00e5');

      // `13A0;CHEROKEE LETTER A;...;;AB70;` (Cherokee gained lowercase
      // letters in Unicode 8.0, so this pins the generated table's version).
      assertSame(run('"\\u13a0".toLowerCase();'), '\uab70');
      assertSame(run('"\\uab70".toUpperCase();'), '\u13a0');
    },
  },
  {
    name: 'case conversion covers the titlecase, dotted, and dotless Latin letters exactly as UnicodeData.txt defines them',
    run() {
      // `01C5;...;Lt;...;01C4;01C6;01C5` — a titlecase letter has both an
      // uppercase (01C4) and a lowercase (01C6) mapping of its own.
      assertSame(run('"\\u01c5".toLowerCase();'), '\u01c6');
      assertSame(run('"\\u01c5".toUpperCase();'), '\u01c4');
      assertSame(run('"\\u01c4".toLowerCase();'), '\u01c6');
      assertSame(run('"\\u01c6".toUpperCase();'), '\u01c4');
      assertSame(run('"\\u01c8".toUpperCase();'), '\u01c7');
      assertSame(run('"\\u01cb".toLowerCase();'), '\u01cc');
      assertSame(run('"\\u01f2".toUpperCase();'), '\u01f1');

      // `0131;LATIN SMALL LETTER DOTLESS I;...;0049;;0049` — its uppercase
      // is plain "I", and "I" lowercases to "i", never back to 0131.
      assertSame(run('"\\u0131".toUpperCase();'), 'I');
      assertSame(run('"I".toLowerCase();'), 'i');
      assertSame(run('"\\u0130".toUpperCase();'), '\u0130');
    },
  },
  {
    name: 'toUpperCase applies the unconditional SpecialCasing expansions, which make the result longer than the input',
    run() {
      // SpecialCasing.txt: `00DF; 00DF; 0053 0073; 0053 0053;`
      assertSame(run('"\\u00df".toUpperCase();'), 'SS');
      assertSame(run('"\\u00df".toUpperCase().length;'), 2);
      assertSame(run('"\\u00df".toLowerCase();'), '\u00df');
      assertSame(run('"stra\\u00dfe".toUpperCase();'), 'STRASSE');

      // `FB00; FB00; 0046 0066; 0046 0046;` and its ligature neighbours.
      assertSame(run('"\\ufb00".toUpperCase();'), 'FF');
      assertSame(run('"\\ufb01".toUpperCase();'), 'FI');
      assertSame(run('"\\ufb03".toUpperCase();'), 'FFI');
      assertSame(run('"\\ufb05".toUpperCase();'), 'ST');
      assertSame(run('"\\ufb00".toLowerCase();'), '\ufb00');

      // `0149; 0149; 02BC 004E; 02BC 004E;`,
      // `01F0; 01F0; 004A 030C; 004A 030C;`,
      // `1E96; 1E96; 0048 0331; 0048 0331;`,
      // `1F50; 1F50; 03A5 0313; 03A5 0313;`,
      // `0390; 0390; 0399 0308 0301; 0399 0308 0301;`.
      assertSame(run('"\\u0149".toUpperCase();'), '\u02bcN');
      assertSame(run('"\\u01f0".toUpperCase();'), 'J\u030c');
      assertSame(run('"\\u1e96".toUpperCase();'), 'H\u0331');
      assertSame(run('"\\u1f50".toUpperCase();'), '\u03a5\u0313');
      assertSame(run('"\\u0390".toUpperCase();'), '\u0399\u0308\u0301');
      assertSame(run('"\\u0390".toUpperCase().length;'), 3);

      // `1F80; 1F80; 1F88; 1F08 0399;` — the uppercase mapping differs from
      // the titlecase one, and only the uppercase column is used here.
      assertSame(run('"\\u1f80".toUpperCase();'), '\u1f08\u0399');
      assertSame(run('"\\u1f80".toLowerCase();'), '\u1f80');
    },
  },
  {
    name: 'toLowerCase applies the one unconditional SpecialCasing lowercase expansion',
    run() {
      // `0130; 0069 0307; 0130; 0130;` — the only unconditional
      // multi-character lowercase mapping in the pinned version.
      assertSame(run('"\\u0130".toLowerCase();'), 'i\u0307');
      assertSame(run('"\\u0130".toLowerCase().length;'), 2);
      assertSame(run('"\\u0130".toLowerCase().charCodeAt(0);'), 105);
      assertSame(run('"\\u0130".toLowerCase().charCodeAt(1);'), 775);
      assertSame(run('"A\\u0130B".toLowerCase();'), 'ai\u0307b');
    },
  },
  {
    name: 'toLowerCase implements the language-neutral Final_Sigma condition and toUpperCase folds both sigmas back',
    run() {
      // `03A3; 03C2; 03A3; 03A3; Final_Sigma;` is the only locale-insensitive
      // *conditional* mapping in SpecialCasing.txt: a capital sigma preceded
      // by a cased letter (ignoring case-ignorable characters) and not
      // followed by one becomes the final form 03C2 rather than 03C3.
      assertSame(run('"\\u03a3".toLowerCase();'), '\u03c3');
      assertSame(run('" \\u03a3".toLowerCase();'), ' \u03c3');
      assertSame(run('"\\u03a3\\u0391".toLowerCase();'), '\u03c3\u03b1');
      assertSame(run('"\\u0391\\u03a3".toLowerCase();'), '\u03b1\u03c2');
      assertSame(
        run('"\\u039f\\u0394\\u039f\\u03a3".toLowerCase();'),
        '\u03bf\u03b4\u03bf\u03c2',
      );
      assertSame(
        run('"\\u0391\\u03a3\\u0391".toLowerCase();'),
        '\u03b1\u03c3\u03b1',
      );
      assertSame(run('"\\u0391\\u03a3 ".toLowerCase();'), '\u03b1\u03c2 ');
      assertSame(run('"\\u0391\\u03a3.".toLowerCase();'), '\u03b1\u03c2.');
      // U+0027 APOSTROPHE is Case_Ignorable, so it neither breaks the
      // preceding-cased run nor counts as a following cased letter.
      assertSame(run('"\\u0391\'\\u03a3".toLowerCase();'), "\u03b1'\u03c2");
      assertSame(
        run('"\\u0391\\u03a3\'\\u0391".toLowerCase();'),
        "\u03b1\u03c3'\u03b1",
      );
      // U+0301 COMBINING ACUTE ACCENT is Mn, hence Case_Ignorable too.
      assertSame(
        run('"\\u0391\\u0301\\u03a3".toLowerCase();'),
        '\u03b1\u0301\u03c2',
      );
      // A digit is neither cased nor case-ignorable, so it breaks the run.
      assertSame(run('"1\\u03a3".toLowerCase();'), '1\u03c3');

      assertSame(run('"\\u03c2".toUpperCase();'), '\u03a3');
      assertSame(run('"\\u03c3".toUpperCase();'), '\u03a3');
      assertSame(run('"\\u03b1\\u03c2".toUpperCase();'), '\u0391\u03a3');
      assertSame(
        run('"\\u0391\\u03a3".toLowerCase().toUpperCase();'),
        '\u0391\u03a3',
      );
    },
  },
  {
    name: 'case conversion maps supplementary code points through their surrogate pairs and leaves lone surrogates alone',
    run() {
      // `10400;DESERET CAPITAL LETTER LONG I;...;;10428;` — U+10400 is the
      // pair D801 DC00 and U+10428 is D801 DC28.
      assertSame(run('"\\ud801\\udc00".toLowerCase();'), '\ud801\udc28');
      assertSame(run('"\\ud801\\udc28".toUpperCase();'), '\ud801\udc00');
      assertSame(run('"\\ud801\\udc00".toLowerCase().length;'), 2);
      assertSame(run('"\\ud801\\udc00".toLowerCase().charCodeAt(0);'), 55297);
      assertSame(run('"\\ud801\\udc00".toLowerCase().charCodeAt(1);'), 56360);

      // `1E900;ADLAM CAPITAL LETTER ALIF;...;;1E922;` — D83A DD00/DD22.
      assertSame(run('"\\ud83a\\udd00".toLowerCase();'), '\ud83a\udd22');
      assertSame(run('"\\ud83a\\udd22".toUpperCase();'), '\ud83a\udd00');

      // Emoji have no case mapping, and unpaired surrogates are passed
      // through as the code units they are.
      assertSame(run('"\\ud83d\\ude00".toUpperCase();'), '\ud83d\ude00');
      assertSame(run('"\\ud800".toLowerCase();'), '\ud800');
      assertSame(run('"\\ud800".toUpperCase();'), '\ud800');
      assertSame(run('"\\udc00".toLowerCase();'), '\udc00');
      assertSame(run('"a\\ud800B".toLowerCase();'), 'a\ud800b');
      assertSame(run('"a\\udfffB".toLowerCase();'), 'a\udfffb');
      assertSame(run('"\\ud801a".toUpperCase();'), '\ud801A');
      assertSame(run('"\\ud801a".toUpperCase().length;'), 2);
      // A high surrogate followed by a *non*-low surrogate must not be
      // treated as a pair, and the trailing high surrogate of a string must
      // not read past the end.
      assertSame(
        run('"\\ud801\\ud801\\udc00".toLowerCase();'),
        '\ud801\ud801\udc28',
      );
      assertSame(run('"a\\ud801".toUpperCase();'), 'A\ud801');
    },
  },
  {
    name: 'the toLocale case methods are deterministic aliases that never consult a host locale',
    run() {
      // If these delegated to a host locale-sensitive implementation under a
      // Turkish locale, "I" would lowercase to U+0131 and "i" would
      // uppercase to U+0130. They are documented aliases of the
      // locale-insensitive mappings, so they never do.
      assertSame(run('"I".toLocaleLowerCase();'), 'i');
      assertSame(run('"i".toLocaleUpperCase();'), 'I');
      assertSame(run('"\\u0130".toLocaleLowerCase();'), 'i\u0307');
      assertSame(run('"\\u0131".toLocaleUpperCase();'), 'I');
      assertSame(run('"ABC".toLocaleLowerCase();'), 'abc');
      assertSame(run('"abc".toLocaleUpperCase();'), 'ABC');
      assertSame(run('"\\u00df".toLocaleUpperCase();'), 'SS');
      assertSame(run('"\\u0391\\u03a3".toLocaleLowerCase();'), '\u03b1\u03c2');
      assertSame(
        run(
          '"\\u00c0\\u00df\\u03a3\\ud801\\udc00".toLocaleLowerCase() === ' +
            '"\\u00c0\\u00df\\u03a3\\ud801\\udc00".toLowerCase();',
        ),
        true,
      );
      assertSame(
        run(
          '"\\u00e0\\u00df\\u03c2\\ud801\\udc28".toLocaleUpperCase() === ' +
            '"\\u00e0\\u00df\\u03c2\\ud801\\udc28".toUpperCase();',
        ),
        true,
      );
      // They are still four distinct function objects.
      assertSame(
        run(
          'String.prototype.toLowerCase === String.prototype.toLocaleLowerCase;',
        ),
        false,
      );
      assertSame(
        run(
          'String.prototype.toUpperCase === String.prototype.toLocaleUpperCase;',
        ),
        false,
      );
    },
  },
  {
    name: 'the case methods are generic, do not mutate their receiver, and reject null/undefined receivers',
    run() {
      for (const method of [
        'toLowerCase',
        'toUpperCase',
        'toLocaleLowerCase',
        'toLocaleUpperCase',
      ]) {
        assertSame(run(`String.prototype.${method}.call(123);`), '123', method);
        assertSame(
          run(`String.prototype.${method}.call(true);`),
          method === 'toUpperCase' || method === 'toLocaleUpperCase'
            ? 'TRUE'
            : 'true',
          method,
        );
        assertSame(
          run(`String.prototype.${method}.call(new String("aB"));`),
          method === 'toUpperCase' || method === 'toLocaleUpperCase'
            ? 'AB'
            : 'ab',
          method,
        );
        assertSame(
          run(
            `var name; try { String.prototype.${method}.call(null); } ` +
              'catch (error) { name = error.name; } name;',
          ),
          'TypeError',
          method,
        );
        assertSame(
          run(
            `var name; try { String.prototype.${method}.call(undefined); } ` +
              'catch (error) { name = error.name; } name;',
          ),
          'TypeError',
          method,
        );
        assertSame(
          run(
            'var thrown = new Error("boom"); var caught; ' +
              'var receiver = { toString: function () { throw thrown; } }; ' +
              `try { String.prototype.${method}.call(receiver); } catch (error) { caught = error; } ` +
              'caught === thrown;',
          ),
          true,
          method,
        );
        assertSame(
          run(`var s = "aBc"; var mapped = s.${method}(); mapped + "|" + s;`),
          method === 'toUpperCase' || method === 'toLocaleUpperCase'
            ? 'ABC|aBc'
            : 'abc|aBc',
          method,
        );
      }

      // Arguments are ignored: these methods take none.
      assertSame(run('"aB".toLowerCase("tr");'), 'ab');
      assertSame(run('"aB".toLocaleLowerCase("tr");'), 'ab');
      assertSame(run('"I".toLocaleLowerCase(["tr", "TR"]);'), 'i');
    },
  },
  {
    name: 'the case methods carry their exact ES5 lengths, names, descriptors, and realm-local identity',
    run() {
      const methods = [
        'toLowerCase',
        'toLocaleLowerCase',
        'toUpperCase',
        'toLocaleUpperCase',
      ];

      for (const name of methods) {
        assertSame(
          run(`String.prototype.${name}.length;`),
          0,
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

      const first = createRealm();
      const second = createRealm();
      // Exact results, not just a same-length string: a borrowed method must
      // compute the same mapping as the local twin it is not.
      const foreignResults = {
        toLowerCase: 'ab',
        toLocaleLowerCase: 'ab',
        toUpperCase: 'AB',
        toLocaleUpperCase: 'AB',
      };

      for (const name of methods) {
        const method = property(
          property(first.globalObject, 'String'),
          'prototype',
        ).get(name);
        const local = property(
          property(second.globalObject, 'String'),
          'prototype',
        ).get(name);

        assertSame(
          method === local,
          false,
          `${name} must be a distinct function object per realm`,
        );
        second.globalObject.defineOwnProperty('foreignMethod', {
          value: method,
          writable: true,
          enumerable: true,
          configurable: true,
        });

        assertSame(
          evaluateScript(second, `foreignMethod === String.prototype.${name};`)
            .value,
          false,
          `${name} must not be shared across realms`,
        );
        assertSame(
          evaluateScript(
            second,
            'foreignMethod.name + ":" + foreignMethod.length;',
          ).value,
          `${name}:0`,
          `${name} identity metadata`,
        );
        assertSame(
          evaluateScript(second, 'foreignMethod.call("aB");').value,
          foreignResults[/** @type {'toLowerCase'} */ (name)],
          `${name} must still behave exactly the same from another realm`,
        );
      }
    },
  },
];

export default tests;
