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
 * Reads a property off an engine object without importing an engine type the
 * harness does not otherwise need.
 *
 * @param {unknown} target
 * @param {string} key
 * @returns {any}
 */
function property(target, key) {
  return /** @type {{ get: (key: string) => unknown }} */ (target).get(key);
}

const tests = [
  {
    // ES5 15.5.4.7. Every expectation below is derived by hand from the
    // algorithm's own definition ("the smallest possible integer k not
    // smaller than start such that ..."), never by consulting a host
    // String.prototype.indexOf.
    name: 'indexOf finds the first code-unit match at or after its start position',
    run() {
      assertSame(run('"abcabc".indexOf("a");'), 0);
      assertSame(run('"abcabc".indexOf("b");'), 1);
      assertSame(run('"abcabc".indexOf("c");'), 2);
      assertSame(run('"abcabc".indexOf("abc");'), 0);
      assertSame(run('"abcabc".indexOf("cab");'), 2);
      assertSame(run('"abcabc".indexOf("abcabc");'), 0);
      assertSame(run('"abcabc".indexOf("abcabca");'), -1);
      assertSame(run('"abcabc".indexOf("z");'), -1);
      assertSame(run('"".indexOf("a");'), -1);
      assertSame(run('"abcabc".indexOf("a", 1);'), 3);
      assertSame(run('"abcabc".indexOf("a", 3);'), 3);
      assertSame(run('"abcabc".indexOf("a", 4);'), -1);
      assertSame(run('"abcabc".indexOf("abc", 1);'), 3);
      // Overlapping occurrences: the search restarts one code unit later,
      // it does not skip past the previous match.
      assertSame(run('"aaaa".indexOf("aa");'), 0);
      assertSame(run('"aaaa".indexOf("aa", 1);'), 1);
      assertSame(run('"aaaa".indexOf("aa", 2);'), 2);
      assertSame(run('"aaaa".indexOf("aa", 3);'), -1);
      assertSame(run('"abababa".indexOf("aba", 1);'), 2);
    },
  },
  {
    name: 'indexOf treats an empty search string and out-of-range positions exactly as ES5 15.5.4.7 clamps them',
    run() {
      assertSame(run('"abc".indexOf("");'), 0);
      assertSame(run('"abc".indexOf("", 0);'), 0);
      assertSame(run('"abc".indexOf("", 1);'), 1);
      assertSame(run('"abc".indexOf("", 3);'), 3);
      assertSame(run('"abc".indexOf("", 4);'), 3);
      assertSame(run('"abc".indexOf("", 100);'), 3);
      assertSame(run('"abc".indexOf("", -1);'), 0);
      assertSame(run('"".indexOf("");'), 0);
      assertSame(run('"".indexOf("", 5);'), 0);
      assertSame(run('"abc".indexOf("c", -100);'), 2);
      assertSame(run('"abc".indexOf("a", 100);'), -1);
    },
  },
  {
    name: 'indexOf applies ToString to the search value and ToInteger to the position, including omitted/undefined/NaN/Infinity/fractions',
    run() {
      assertSame(run('"1234".indexOf(3);'), 2);
      assertSame(run('"truefalse".indexOf(false);'), 4);
      assertSame(run('"xnullx".indexOf(null);'), 1);
      assertSame(run('"xundefinedx".indexOf(undefined);'), 1);
      assertSame(run('"a1,2b".indexOf([1, 2]);'), 1);
      assertSame(
        run('"xyz".indexOf({ toString: function () { return "y"; } });'),
        1,
      );

      // ToInteger: undefined and NaN both become +0, fractions truncate
      // toward zero, -Infinity clamps to 0 and +Infinity clamps to length.
      assertSame(run('"abcabc".indexOf("a", undefined);'), 0);
      assertSame(run('"abcabc".indexOf("a", NaN);'), 0);
      assertSame(run('"abcabc".indexOf("a", "junk");'), 0);
      assertSame(run('"abcabc".indexOf("a", 3.9);'), 3);
      assertSame(run('"abcabc".indexOf("a", 3.2);'), 3);
      assertSame(run('"abcabc".indexOf("a", -3.9);'), 0);
      assertSame(run('"abcabc".indexOf("a", -Infinity);'), 0);
      assertSame(run('"abcabc".indexOf("a", Infinity);'), -1);
      assertSame(run('"abcabc".indexOf("", Infinity);'), 6);
      assertSame(run('"abcabc".indexOf("a", true);'), 3);
      assertSame(run('"abcabc".indexOf("a", "3");'), 3);
      assertSame(run('"abcabc".indexOf("a", null);'), 0);
    },
  },
  {
    name: 'indexOf compares code units, splitting surrogate pairs like every other ES5 String method',
    run() {
      assertSame(run('"a\\ud83d\\ude00b".indexOf("\\ud83d");'), 1);
      assertSame(run('"a\\ud83d\\ude00b".indexOf("\\ude00");'), 2);
      assertSame(run('"a\\ud83d\\ude00b".indexOf("\\ud83d\\ude00");'), 1);
      assertSame(run('"a\\ud83d\\ude00b".indexOf("b");'), 3);
      assertSame(run('"a\\ud83d\\ude00b".length;'), 4);
      assertSame(run('"\\u0000a\\u0000".indexOf("\\u0000", 1);'), 2);
      assertSame(run('"\\uffff".indexOf("\\uffff");'), 0);
      assertSame(run('"AB".indexOf("ab");'), -1);
    },
  },
  {
    name: 'indexOf is generic, coerces the receiver before its arguments, and propagates a coercion error by identity',
    run() {
      assertSame(run('String.prototype.indexOf.call(12345, 34);'), 2);
      assertSame(run('String.prototype.indexOf.call(true, "ru");'), 1);
      assertSame(run('new String("abcabc").indexOf("b", 2);'), 4);
      assertSame(
        run('String.prototype.indexOf.call(new String("xyz"), "z");'),
        2,
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "hello"; } }; ' +
            'var search = { toString: function () { order += "s"; return "l"; } }; ' +
            'var position = { valueOf: function () { order += "p"; return 3; } }; ' +
            'String.prototype.indexOf.call(receiver, search, position) + ":" + order;',
        ),
        '3:rsp',
      );
      assertSame(
        run(
          'var name; try { String.prototype.indexOf.call(null, "a"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.indexOf.call(undefined, "a"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; ' +
            'var reached = false; ' +
            'var search = { toString: function () { throw thrown; } }; ' +
            'var position = { valueOf: function () { reached = true; return 0; } }; ' +
            'try { "abc".indexOf(search, position); } catch (error) { caught = error; } ' +
            '(caught === thrown) + ":" + reached;',
        ),
        'true:false',
      );
    },
  },
  {
    // ES5 15.5.4.8: "the largest possible integer k not larger than start".
    name: 'lastIndexOf finds the last code-unit match at or before its start position',
    run() {
      assertSame(run('"abcabc".lastIndexOf("a");'), 3);
      assertSame(run('"abcabc".lastIndexOf("c");'), 5);
      assertSame(run('"abcabc".lastIndexOf("abc");'), 3);
      assertSame(run('"abcabc".lastIndexOf("z");'), -1);
      assertSame(run('"abcabc".lastIndexOf("a", 0);'), 0);
      assertSame(run('"abcabc".lastIndexOf("a", 2);'), 0);
      assertSame(run('"abcabc".lastIndexOf("a", 3);'), 3);
      assertSame(run('"abcabc".lastIndexOf("a", 10);'), 3);
      assertSame(run('"abcabc".lastIndexOf("abc", 3);'), 3);
      assertSame(run('"abcabc".lastIndexOf("abc", 2);'), 0);
      // The match may start at or before `start` but must still fit inside
      // the string, so a start near the end does not truncate the match.
      assertSame(run('"abcabc".lastIndexOf("abc", 5);'), 3);
      assertSame(run('"aaaa".lastIndexOf("aa");'), 2);
      assertSame(run('"aaaa".lastIndexOf("aa", 1);'), 1);
      assertSame(run('"aaaa".lastIndexOf("aa", 0);'), 0);
      assertSame(run('"abababa".lastIndexOf("aba", 3);'), 2);
      assertSame(run('"".lastIndexOf("a");'), -1);
    },
  },
  {
    name: 'lastIndexOf treats an omitted or NaN position as +Infinity, unlike indexOf',
    run() {
      assertSame(run('"abcabc".lastIndexOf("a", undefined);'), 3);
      assertSame(run('"abcabc".lastIndexOf("a", NaN);'), 3);
      assertSame(run('"abcabc".lastIndexOf("a", "junk");'), 3);
      assertSame(run('"abcabc".lastIndexOf("a", Infinity);'), 3);
      assertSame(run('"abcabc".lastIndexOf("a", -Infinity);'), 0);
      assertSame(run('"abcabc".lastIndexOf("a", -1);'), 0);
      assertSame(run('"abcabc".lastIndexOf("a", 3.9);'), 3);
      assertSame(run('"abcabc".lastIndexOf("a", 2.9);'), 0);
      assertSame(run('"abcabc".lastIndexOf("b", null);'), -1);
      assertSame(run('"abc".lastIndexOf("");'), 3);
      assertSame(run('"abc".lastIndexOf("", 1);'), 1);
      assertSame(run('"abc".lastIndexOf("", 0);'), 0);
      assertSame(run('"abc".lastIndexOf("", -5);'), 0);
      assertSame(run('"abc".lastIndexOf("", 100);'), 3);
      assertSame(run('"".lastIndexOf("");'), 0);
      assertSame(run('"1234".lastIndexOf(3);'), 2);
      assertSame(run('"xundefinedx".lastIndexOf(undefined);'), 1);
    },
  },
  {
    name: 'lastIndexOf is generic, coerces receiver then search then position, and preserves surrogate code units',
    run() {
      assertSame(run('String.prototype.lastIndexOf.call(12341, 1);'), 4);
      assertSame(run('new String("abcabc").lastIndexOf("b");'), 4);
      assertSame(run('"a\\ud83d\\ude00\\ud83d".lastIndexOf("\\ud83d");'), 3);
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "hello"; } }; ' +
            'var search = { toString: function () { order += "s"; return "l"; } }; ' +
            'var position = { valueOf: function () { order += "p"; return 2; } }; ' +
            'String.prototype.lastIndexOf.call(receiver, search, position) + ":" + order;',
        ),
        '2:rsp',
      );
      assertSame(
        run(
          'var name; try { String.prototype.lastIndexOf.call(null, "a"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; var reached = false; ' +
            'var search = { toString: function () { throw thrown; } }; ' +
            'var position = { valueOf: function () { reached = true; return 0; } }; ' +
            'try { "abc".lastIndexOf(search, position); } catch (error) { caught = error; } ' +
            '(caught === thrown) + ":" + reached;',
        ),
        'true:false',
      );
    },
  },
  {
    // ES5 15.5.4.9 leaves the ordering implementation-defined but requires a
    // consistent comparison function. This engine defines it as code-unit
    // lexicographic order — the same order the `<` operator (11.8.5) uses —
    // so the result never depends on a host locale.
    name: 'localeCompare orders strings by code unit and returns only -1, 0, or +1',
    run() {
      assertSame(run('"a".localeCompare("a");'), 0);
      assertSame(run('"".localeCompare("");'), 0);
      assertSame(run('"a".localeCompare("b");'), -1);
      assertSame(run('"b".localeCompare("a");'), 1);
      assertSame(run('"a".localeCompare("A");'), 1);
      assertSame(run('"A".localeCompare("a");'), -1);
      assertSame(run('"abc".localeCompare("abd");'), -1);
      assertSame(run('"abc".localeCompare("ab");'), 1);
      assertSame(run('"ab".localeCompare("abc");'), -1);
      assertSame(run('"".localeCompare("a");'), -1);
      assertSame(run('"a".localeCompare("");'), 1);
      assertSame(run('"\\u00e4".localeCompare("z");'), 1);
      assertSame(run('"\\uffff".localeCompare("\\ufffe");'), 1);
      assertSame(run('"\\u0000".localeCompare("\\u0001");'), -1);
      assertSame(run('"\\ud83d\\ude00".localeCompare("\\ud83d\\ude01");'), -1);
      assertSame(run('typeof "a".localeCompare("b");'), 'number');
      // Code-unit ordering means canonically equivalent strings that differ
      // in code units do not compare equal: ES5 15.5.4.9 only *recommends*
      // that they do, and its ordering is implementation-defined. This
      // engine chooses determinism over normalization, so the difference is
      // asserted rather than left to chance.
      assertSame(run('"\\u00e9".localeCompare("e\\u0301");'), 1);
      assertSame(run('"e\\u0301".localeCompare("\\u00e9");'), -1);
      assertSame(run('"\\u00e9" === "e\\u0301";'), false);
      // U+FB01 (the fi ligature) is compatibility-equivalent to "fi" and is
      // likewise ordered by code unit.
      assertSame(run('"\\ufb01".localeCompare("fi");'), 1);
    },
  },
  {
    name: 'localeCompare is a consistent ordering: antisymmetric, transitive, and reflexive over a fixed sample',
    run() {
      assertSame(
        run(
          'var sample = ["", "a", "A", "ab", "b", "\\u00e4", "\\uffff", "0", "z"]; ' +
            'var problems = ""; ' +
            'for (var i = 0; i < sample.length; i++) { ' +
            '  if (sample[i].localeCompare(sample[i]) !== 0) { problems += "reflexive" + i + ";"; } ' +
            '  for (var j = 0; j < sample.length; j++) { ' +
            '    var forward = sample[i].localeCompare(sample[j]); ' +
            '    var backward = sample[j].localeCompare(sample[i]); ' +
            '    if (forward !== -backward) { problems += "antisymmetric" + i + "," + j + ";"; } ' +
            '    for (var k = 0; k < sample.length; k++) { ' +
            '      var second = sample[j].localeCompare(sample[k]); ' +
            '      var whole = sample[i].localeCompare(sample[k]); ' +
            '      if (forward < 0 && second < 0 && !(whole < 0)) { problems += "transitive" + i + "," + j + "," + k + ";"; } ' +
            '    } ' +
            '  } ' +
            '} ' +
            'problems;',
        ),
        '',
      );
      // The ordering agrees with the language's own relational comparison.
      assertSame(
        run(
          'var sample = ["", "a", "A", "ab", "b", "\\u00e4", "\\uffff", "0", "z"]; ' +
            'var problems = ""; ' +
            'for (var i = 0; i < sample.length; i++) { ' +
            '  for (var j = 0; j < sample.length; j++) { ' +
            '    var expected = sample[i] < sample[j] ? -1 : (sample[i] === sample[j] ? 0 : 1); ' +
            '    if (sample[i].localeCompare(sample[j]) !== expected) { problems += i + "," + j + ";"; } ' +
            '  } ' +
            '} ' +
            'problems;',
        ),
        '',
      );
    },
  },
  {
    name: 'localeCompare is generic, applies ToString to receiver then argument, and rejects null/undefined receivers',
    run() {
      assertSame(run('String.prototype.localeCompare.call(2, "2");'), 0);
      assertSame(run('String.prototype.localeCompare.call(2, 3);'), -1);
      assertSame(run('new String("a").localeCompare("a");'), 0);
      assertSame(run('"undefined".localeCompare(undefined);'), 0);
      assertSame(run('"null".localeCompare(null);'), 0);
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "a"; } }; ' +
            'var that = { toString: function () { order += "t"; return "a"; } }; ' +
            'String.prototype.localeCompare.call(receiver, that) + ":" + order;',
        ),
        '0:rt',
      );
      assertSame(
        run(
          'var name; try { String.prototype.localeCompare.call(null, "a"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; ' +
            'var that = { toString: function () { throw thrown; } }; ' +
            'try { "a".localeCompare(that); } catch (error) { caught = error; } ' +
            'caught === thrown;',
        ),
        true,
      );
    },
  },
  {
    // ES5 15.5.4.20 trims exactly the union of WhiteSpace (7.2) and
    // LineTerminator (7.3): TAB, VT, FF, SP, NBSP, BOM, every Zs code point
    // of the pinned Unicode version, LF, CR, LS, and PS.
    name: 'trim removes exactly the ES5 whitespace and line-terminator set from both ends',
    run() {
      assertSame(run('"  abc  ".trim();'), 'abc');
      assertSame(run('"abc".trim();'), 'abc');
      assertSame(run('"".trim();'), '');
      assertSame(run('"   ".trim();'), '');
      assertSame(run('"\\t\\n\\v\\f\\r abc \\r\\f\\v\\n\\t".trim();'), 'abc');
      assertSame(run('"\\u0009abc\\u0009".trim();'), 'abc');
      assertSame(run('"\\u000babc\\u000b".trim();'), 'abc');
      assertSame(run('"\\u000cabc\\u000c".trim();'), 'abc');
      assertSame(run('"\\u0020abc\\u0020".trim();'), 'abc');
      assertSame(run('"\\u00a0abc\\u00a0".trim();'), 'abc');
      assertSame(run('"\\ufeffabc\\ufeff".trim();'), 'abc');
      assertSame(run('"\\u000aabc\\u000a".trim();'), 'abc');
      assertSame(run('"\\u000dabc\\u000d".trim();'), 'abc');
      assertSame(run('"\\u2028abc\\u2028".trim();'), 'abc');
      assertSame(run('"\\u2029abc\\u2029".trim();'), 'abc');
      assertSame(run('"\\u1680abc\\u1680".trim();'), 'abc');
      assertSame(run('"\\u2000abc\\u200a".trim();'), 'abc');
      assertSame(
        run('"\\u2001\\u2002\\u2003\\u2004\\u2005abc".trim();'),
        'abc',
      );
      assertSame(
        run('"\\u2006\\u2007\\u2008\\u2009\\u200aabc".trim();'),
        'abc',
      );
      assertSame(run('"\\u202fabc\\u202f".trim();'), 'abc');
      assertSame(run('"\\u205fabc\\u205f".trim();'), 'abc');
      assertSame(run('"\\u3000abc\\u3000".trim();'), 'abc');
      assertSame(
        run(
          '"\\u0009\\u000a\\u000b\\u000c\\u000d\\u0020\\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff".trim();',
        ),
        '',
      );
      // Interior whitespace is untouched.
      assertSame(run('"  a b\\tc  ".trim();'), 'a b\tc');
      assertSame(run('"\\n a \\n b \\n".trim();'), 'a \n b');
    },
  },
  {
    name: 'trim leaves near-miss characters that are not ES5 whitespace in place',
    run() {
      // U+180E is Cf (not Zs) in the pinned Unicode version, U+200B/U+200C/
      // U+200D/U+2060 are Cf, U+0085 is Cc but not a JS LineTerminator, and
      // U+00B7/U+3164/U+1361 are ordinary characters.
      assertSame(run('"\\u180eabc\\u180e".trim();'), '\u180eabc\u180e');
      assertSame(run('"\\u200babc\\u200b".trim();'), '\u200babc\u200b');
      assertSame(run('"\\u200cabc".trim();'), '\u200cabc');
      assertSame(run('"\\u200dabc".trim();'), '\u200dabc');
      assertSame(run('"\\u2060abc".trim();'), '\u2060abc');
      assertSame(run('"\\u0085abc\\u0085".trim();'), '\u0085abc\u0085');
      assertSame(run('"\\u00b7abc".trim();'), '\u00b7abc');
      assertSame(run('"\\u3164abc".trim();'), '\u3164abc');
      assertSame(run('"\\u0000abc\\u0000".trim();'), '\u0000abc\u0000');
      assertSame(run('"\\ufffeabc\\ufffe".trim();'), '\ufffeabc\ufffe');
      assertSame(run('"\\ud83d\\ude00 ".trim();'), '\ud83d\ude00');
      assertSame(run('" \\ud800".trim();'), '\ud800');
      assertSame(run('"\\u1361abc".trim().length;'), 4);
    },
  },
  {
    name: 'trim is generic, does not mutate its receiver, and rejects null/undefined receivers',
    run() {
      assertSame(run('String.prototype.trim.call(123);'), '123');
      assertSame(run('String.prototype.trim.call(true);'), 'true');
      assertSame(run('new String("  a  ").trim();'), 'a');
      assertSame(run('String.prototype.trim.call(new String(" x "));'), 'x');
      assertSame(
        run('var s = "  abc  "; var trimmed = s.trim(); trimmed + "|" + s;'),
        'abc|  abc  ',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return " a "; } }; ' +
            'String.prototype.trim.call(receiver) + ":" + order;',
        ),
        'a:r',
      );
      assertSame(
        run(
          'var name; try { String.prototype.trim.call(null); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { String.prototype.trim.call(undefined); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; ' +
            'var receiver = { toString: function () { throw thrown; } }; ' +
            'try { String.prototype.trim.call(receiver); } catch (error) { caught = error; } ' +
            'caught === thrown;',
        ),
        true,
      );
    },
  },
  {
    name: 'indexOf, lastIndexOf, localeCompare, and trim carry their exact ES5 lengths, names, descriptors, and realm-local identity',
    run() {
      const methodLengths = {
        indexOf: 1,
        lastIndexOf: 1,
        localeCompare: 1,
        trim: 0,
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
        assertSame(
          run(
            `var found = false; for (var key in String.prototype) { if (key === "${name}") { found = true; } } found;`,
          ),
          false,
          `${name} must not be enumerable`,
        );
      }

      const first = createRealm();
      const second = createRealm();
      // Exact results, not "something other than undefined": a borrowed
      // method must compute the same answer as the local twin it is not.
      const foreignCalls = {
        indexOf: ['foreignMethod.call(" ab ", "b");', 2],
        lastIndexOf: ['foreignMethod.call(" ab ", "b");', 2],
        localeCompare: ['foreignMethod.call(" ab ", "b");', -1],
        trim: ['foreignMethod.call(" ab ");', 'ab'],
      };

      for (const name of Object.keys(methodLengths)) {
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
          `${name}:${methodLengths[/** @type {'trim'} */ (name)]}`,
          `${name} identity metadata`,
        );

        const [source, expected] = foreignCalls[/** @type {'trim'} */ (name)];

        assertSame(
          evaluateScript(second, String(source)).value,
          expected,
          `${name} must still behave exactly the same from another realm`,
        );
      }
    },
  },
];

export default tests;
