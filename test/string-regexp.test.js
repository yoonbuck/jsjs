import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);
  assertSame(
    completion.type,
    'normal',
    `expected normal completion for: ${source}`,
  );
  return completion.value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function runIn(realm, source) {
  const completion = evaluateScript(realm, source);
  assertSame(
    completion.type,
    'normal',
    `expected normal completion for: ${source}`,
  );
  return completion.value;
}

const tests = [
  {
    // ES5 15.5.4.10 steps 4-10: a non-global RegExp pattern reduces to a
    // single `RegExp.prototype.exec` call, so `match` returns the exact
    // exec-shaped array (`0`..`n`, `index`, `input`), or `null` when there is
    // no match. A global pattern instead accumulates only the matched
    // strings and answers `null` for zero matches (never an empty array).
    name: 'match with a non-global RegExp returns the exec-shaped array, and null on failure',
    run() {
      assertSame(
        run(
          'var m = "abcabc".match(/b(c)/); ' +
            'm.length + ":" + m[0] + ":" + m[1] + ":" + m.index + ":" + m.input;',
        ),
        '2:bc:c:1:abcabc',
      );
      assertSame(run('"abc".match(/z/);'), null);
      assertSame(
        run('Object.prototype.toString.call("abc".match(/b/));'),
        '[object Array]',
      );
      assertSame(run('"a.c".match(/./)[0];'), 'a');
      assertSame(run('"abc".match(/x/);'), null);
    },
  },
  {
    name: 'match with a global RegExp returns only the matched strings, and resets lastIndex to 0',
    run() {
      const realm = createRealm();
      runIn(realm, 'var r = /b/g; r.lastIndex = 5;');
      assertSame(runIn(realm, '"abcabc".match(r).join("|");'), 'b|b');
      assertSame(runIn(realm, 'r.lastIndex;'), 0);
      assertSame(run('"abc".match(/z/g);'), null);
      assertSame(
        run('Object.prototype.toString.call("aXbXc".match(/X/g));'),
        '[object Array]',
      );
      // A global match's array holds only strings: no `index`/`input`.
      assertSame(run('"index" in "aXbXc".match(/X/g);'), false);
      assertSame(run('"input" in "aXbXc".match(/X/g);'), false);
    },
  },
  {
    // The zero-width bump (15.5.4.10 step 8.f.i, reused from exec): a match
    // that leaves `lastIndex` unchanged forces it one code unit forward so
    // the loop terminates and every position is still visited.
    name: 'match with a global zero-width pattern bumps lastIndex and yields one match per position',
    run() {
      assertSame(run('"aaa".match(/(?:)/g).length;'), 4);
      assertSame(run('"aaa".match(/(?:)/g).join("|");'), '|||');
      assertSame(run('"".match(/(?:)/g).length;'), 1);
    },
  },
  {
    name: 'replace with a non-global RegExp replaces only the first match',
    run() {
      assertSame(run('"abcabc".replace(/b/, "X");'), 'aXcabc');
      assertSame(run('"abc".replace(/z/, "X");'), 'abc');
      assertSame(run('"aaa".replace(/a/, "X");'), 'Xaa');
    },
  },
  {
    name: 'replace with a global RegExp replaces every match',
    run() {
      assertSame(run('"abcabc".replace(/b/g, "X");'), 'aXcaXc');
      assertSame(run('"a-b-c".replace(/-/g, "");'), 'abc');
      // A global replace of a zero-width pattern inserts between every code
      // unit, matching the same bump `match` uses.
      assertSame(run('"aaa".replace(/(?:)/g, "-");'), '-a-a-a-');
      assertSame(run('"".replace(/(?:)/g, "-");'), '-');
    },
  },
  {
    name: "replace expands $$, $&, $`, $', and numbered captures, with an undefined capture becoming the empty string",
    run() {
      assertSame(run('"abc".replace(/b/, "$$");'), 'a$c');
      assertSame(run('"abcabc".replace(/b/, "[$&]");'), 'a[b]cabc');
      assertSame(run('"abc".replace(/b/, "[$`]");'), 'a[a]c');
      assertSame(run('"abc".replace(/b/, "[$\']");'), 'a[c]c');
      assertSame(
        run('"2016-01-02".replace(/(\\d+)-(\\d+)-(\\d+)/, "$3/$2/$1");'),
        '02/01/2016',
      );
      // $01 reads as capture 1 (two-digit, leading zero).
      assertSame(run('"ab".replace(/(a)(b)/, "$02-$01");'), 'b-a');
      // $12 with only 2 groups: the two-digit reading (12) is out of range,
      // so it falls back to $1 followed by the literal digit "2".
      assertSame(run('"ab".replace(/(a)(b)/, "$12");'), 'a2');
      // A $n above the group count entirely (no viable one- or two-digit
      // fallback) stays fully literal text.
      assertSame(run('"ab".replace(/(a)(b)/, "$9");'), '$9');
      // A non-participating optional capture becomes the empty string.
      assertSame(run('"a".replace(/a(b)?/, "[$1]");'), '[]');
    },
  },
  {
    name: 'a functional replacer receives the match, every capture, the position, and the whole string, with this undefined',
    run() {
      assertSame(
        run(
          'var seenThis; ' +
            'var result = "2016-01-02".replace(/(\\d+)-(\\d+)-(\\d+)/, function () { ' +
            '  "use strict"; ' +
            '  seenThis = this; ' +
            '  return arguments.length + ":" + arguments[0] + ":" + arguments[1] + ":" + ' +
            '    arguments[2] + ":" + arguments[3] + ":" + arguments[4] + ":" + arguments[5]; ' +
            '}); ' +
            'result + "|" + (seenThis === undefined);',
        ),
        '6:2016-01-02:2016:01:02:0:2016-01-02|true',
      );
      // A non-participating capture is passed as `undefined`, not a string.
      assertSame(
        run(
          'var capture; ' +
            '"a".replace(/a(b)?/, function (m, c1) { capture = c1; return "X"; }); ' +
            'capture === undefined;',
        ),
        true,
      );
      // No match means no call at all.
      assertSame(
        run(
          'var calls = 0; ' +
            'var result = "abc".replace(/z/, function () { calls += 1; return "X"; }); ' +
            'result + ":" + calls;',
        ),
        'abc:0',
      );
      // Global replace calls the function once per match.
      assertSame(
        run(
          'var calls = 0; ' +
            '"aXbXc".replace(/X/g, function () { calls += 1; return "-"; }); ' +
            'calls;',
        ),
        2,
      );
      // The function's result is used verbatim: no $ expansion applied to it.
      assertSame(
        run('"abc".replace(/b/, function () { return "$&"; });'),
        'a$&c',
      );
    },
  },
  {
    name: 'replace converts a non-callable replacement to a String even when the RegExp does not match',
    run() {
      assertSame(
        run(
          'var calls = 0; ' +
            'var replacement = { toString: function () { calls += 1; return "X"; } }; ' +
            '"abc".replace(/z/, replacement) + ":" + calls;',
        ),
        'abc:1',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; ' +
            'var replacement = { toString: function () { throw thrown; } }; ' +
            'try { "abc".replace(/z/, replacement); } catch (error) { caught = error; } ' +
            'caught === thrown;',
        ),
        true,
      );
    },
  },
  {
    name: 'search ignores global and lastIndex, always starting from 0, and leaves lastIndex unchanged',
    run() {
      assertSame(run('"abcabc".search(/b/);'), 1);
      assertSame(run('"abc".search(/z/);'), -1);
      assertSame(run('"a.c".search(/./);'), 0);

      const realm = createRealm();
      runIn(realm, 'var r = /b/g; r.lastIndex = 5;');
      assertSame(runIn(realm, '"abcabc".search(r);'), 1);
      assertSame(runIn(realm, 'r.lastIndex;'), 5);

      const realm2 = createRealm();
      runIn(realm2, 'var r2 = /a/g; r2.lastIndex = 100;');
      assertSame(runIn(realm2, '"xyz".search(r2);'), -1);
      assertSame(runIn(realm2, 'r2.lastIndex;'), 100);
    },
  },
  {
    name: 'split with a RegExp separator divides on every match and interleaves captures',
    run() {
      assertSame(run('"ab".split(/a*?/).join(",");'), 'a,b');
      assertSame(run('"ab".split(/a*/).join(",");'), ',b');
      assertSame(
        run(
          '"A<B>bold</B>and<CODE>coded</CODE>"' +
            '.split(/<(\\/)?([^<>]+)>/).join("|");',
        ),
        'A||B|bold|/|B|and||CODE|coded|/|CODE|',
      );
      assertSame(run('"".split(/./).join(",");'), '');
      assertSame(run('"".split(/./).length;'), 1);
      assertSame(run('"".split(/(?:)/).length;'), 0);
      assertSame(run('"a,b,c".split(/,/).join("|");'), 'a|b|c');
      assertSame(run('"a1b2c".split(/\\d/).join("|");'), 'a|b|c');
    },
  },
  {
    name: 'split with a RegExp separator and captures produces undefined for a non-participating group',
    run() {
      assertSame(
        run(
          'var parts = "A<B>bold</B>"' +
            '.split(/<(\\/)?([^<>]+)>/); ' +
            'parts.length + ":" + parts[0] + ":" + parts[1] + ":" + parts[2] + ":" + ' +
            'parts[3] + ":" + parts[4] + ":" + parts[5] + ":" + parts[6];',
        ),
        '7:A:undefined:B:bold:/:B:',
      );
      assertSame(
        run(
          'var parts = "A<B>bold</B>".split(/<(\\/)?([^<>]+)>/); ' +
            '(1 in parts) + ":" + parts[1];',
        ),
        'true:undefined',
      );
    },
  },
  {
    name: 'split with a RegExp separator respects limit, including limits reached mid-capture',
    run() {
      assertSame(run('"a,b,c".split(/,/, 2).join("|");'), 'a|b');
      assertSame(run('"a,b,c".split(/,/, 0).length;'), 0);
      // The limit is reached while pushing this match's captures: the
      // pre-match text is included, but only the first capture, and the
      // element (`undefined`, the non-participating group) is present as an
      // own property, not simply missing.
      assertSame(run('"A<B>bold".split(/<(\\/)?([^<>]+)>/, 2).length;'), 2);
      assertSame(run('"A<B>bold".split(/<(\\/)?([^<>]+)>/, 2)[0];'), 'A');
      assertSame(run('"A<B>bold".split(/<(\\/)?([^<>]+)>/, 2)[1];'), undefined);
      assertSame(run('1 in "A<B>bold".split(/<(\\/)?([^<>]+)>/, 2);'), true);
    },
  },
  {
    name: 'split converts its limit before it looks at a RegExp separator',
    run() {
      assertSame(
        run(
          'var order = ""; ' +
            'var limit = { valueOf: function () { order += "l"; return 2; } }; ' +
            '"a,b,c".split(/,/, limit).join("|") + ":" + order;',
        ),
        'a|b:l',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; ' +
            'var limit = { valueOf: function () { throw thrown; } }; ' +
            'try { "a,b".split(/,/, limit); } catch (error) { caught = error; } ' +
            'caught === thrown;',
        ),
        true,
      );
      // A RegExp separator still dispatches correctly even when the limit
      // is already zero: the result is empty, not a refusal or a fall
      // through to the String-separator branch.
      assertSame(run('"a,b".split(/,/, 0).length;'), 0);
    },
  },
  {
    // ES5's implicit `new RegExp(pattern)`: a string pattern with RegExp
    // syntax is now interpreted as one, ending the deviation the earlier
    // string-only implementation had.
    name: 'match, search, replace, and split now honor RegExp syntax in a string pattern',
    run() {
      assertSame(run('"a.c".match(".")[0];'), 'a');
      assertSame(run('"abc".match(".")[0];'), 'a');
      assertSame(run('"a.c".search(".");'), 0);
      assertSame(run('"abc".search(".");'), 0);
      // replace/split with a String searchValue/separator are unaffected:
      // they stay literal searches, never regexp-ified.
      assertSame(run('"a.c".replace(".", "X");'), 'aXc');
      assertSame(run('"a.c".split(".").join("|");'), 'a|c');
    },
  },
  {
    name: 'match and search coerce their receiver before the pattern, and a RegExp object is no longer refused',
    run() {
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "abc"; } }; ' +
            'String.prototype.match.call(receiver, /b/).index + ":" + order;',
        ),
        '1:r',
      );
      assertSame(
        run(
          'var name; try { String.prototype.match.call(null, /a/); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      // The pattern methods no longer throw for a RegExp object.
      assertSame(run('"abc".match(/b/)[0];'), 'b');
      assertSame(run('"abc".search(/b/);'), 1);
      assertSame(run('"abc".replace(/b/, "X");'), 'aXc');
      assertSame(run('"abc".split(/b/).join("|");'), 'a|c');
    },
  },
];

export default tests;
