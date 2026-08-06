import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

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
 * Publishes an engine object with an arbitrary `[[Class]]` as a global, which
 * is how this suite gets hold of something the pattern methods must treat as
 * a RegExp: guest code cannot build one yet (regular expression literals
 * throw `UnsupportedNodeError` and there is no `RegExp` constructor), so the
 * class tag is injected directly at the runtime boundary.
 *
 * @param {string} className
 * @param {(realm: import('../src/runtime/realm.js').Realm, object: EngineObject) => void} [decorate]
 * @returns {{ realm: import('../src/runtime/realm.js').Realm }}
 */
function realmWithTaggedObject(className, decorate) {
  const realm = createRealm();
  const object = new EngineObject(
    /** @type {any} */ (realm.intrinsics).objectPrototype,
    className,
  );

  decorate?.(realm, object);
  realm.globalObject.defineOwnProperty('tagged', {
    value: object,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return { realm };
}

const tests = [
  {
    // ES5 15.5.4.11's non-RegExp branch is pure string search: the first
    // occurrence of ToString(searchValue), and only the first.
    name: 'replace substitutes the first occurrence of a string pattern and nothing else',
    run() {
      assertSame(run('"abcabc".replace("b", "X");'), 'aXcabc');
      assertSame(run('"abcabc".replace("abc", "X");'), 'Xabc');
      assertSame(run('"abc".replace("z", "X");'), 'abc');
      assertSame(run('"abc".replace("abc", "");'), '');
      assertSame(run('"aaa".replace("aa", "b");'), 'ba');
      assertSame(run('"aaa".replace("a", "");'), 'aa');
      assertSame(run('"abc".replace("", "X");'), 'Xabc');
      assertSame(run('"".replace("", "X");'), 'X');
      assertSame(run('"".replace("a", "X");'), '');
      assertSame(run('"abc".replace("c", "XY");'), 'abXY');
      assertSame(
        run('"a\\ud83d\\ude00b".replace("\\ud83d", "X");'),
        'aX\ude00b',
      );
      assertSame(
        run('"a\\ud83d\\ude00b".replace("\\ud83d\\ude00", "X");'),
        'aXb',
      );
      // ToString on both arguments.
      assertSame(run('"a1b".replace(1, 2);'), 'a2b');
      assertSame(run('"atrueb".replace(true, false);'), 'afalseb');
      assertSame(run('"aundefinedb".replace(undefined, "X");'), 'aXb');
      assertSame(run('"anullb".replace(null, "X");'), 'aXb');
      assertSame(run('"abc".replace("b", undefined);'), 'aundefinedc');
      assertSame(
        run(
          '"abc".replace({ toString: function () { return "b"; } }, ' +
            '{ toString: function () { return "!"; } });',
        ),
        'a!c',
      );
    },
  },
  {
    name: 'replace expands the ES5 Table 22 dollar tokens and leaves every other dollar sequence literal',
    run() {
      assertSame(run('"abc".replace("b", "$$");'), 'a$c');
      assertSame(run('"abc".replace("b", "$$$$");'), 'a$$c');
      assertSame(run('"abcabc".replace("b", "$&");'), 'abcabc');
      assertSame(run('"abcabc".replace("b", "[$&]");'), 'a[b]cabc');
      assertSame(run('"abcabc".replace("bc", "<$&>");'), 'a<bc>abc');
      assertSame(run('"abc".replace("b", "[$`]");'), 'a[a]c');
      assertSame(run('"abc".replace("b", "[$\']");'), 'a[c]c');
      assertSame(run('"abc".replace("a", "[$`]");'), '[]bc');
      assertSame(run('"abc".replace("c", "[$\']");'), 'ab[]');
      assertSame(run('"abc".replace("b", "$&$$$&");'), 'ab$bc');
      // A string pattern has no captures, so $1-$99 are not substitution
      // tokens: ES5 Table 22 leaves that case implementation-defined and this
      // engine keeps the token text, like every shipping engine does.
      assertSame(run('"abc".replace("b", "$1");'), 'a$1c');
      assertSame(run('"abc".replace("b", "$9");'), 'a$9c');
      assertSame(run('"abc".replace("b", "$01");'), 'a$01c');
      assertSame(run('"abc".replace("b", "$99");'), 'a$99c');
      // Dollars that begin no token at all stay exactly as written.
      assertSame(run('"abc".replace("b", "$");'), 'a$c');
      assertSame(run('"abc".replace("b", "$x");'), 'a$xc');
      assertSame(run('"abc".replace("b", "x$");'), 'ax$c');
      assertSame(run('"abc".replace("b", "$+");'), 'a$+c');
      assertSame(run('"abc".replace("b", "$_$&");'), 'a$_bc');
    },
  },
  {
    name: 'a functional replacer receives the match, its position, and the whole string, and its result is used verbatim',
    run() {
      assertSame(
        run(
          '"abcabc".replace("b", function (matched, position, whole) { ' +
            '  return matched + ":" + position + ":" + whole + ":" + arguments.length; ' +
            '});',
        ),
        'ab:1:abcabc:3cabc',
      );
      assertSame(
        run('"abc".replace("", function (m, p, s) { return p + "|"; });'),
        '0|abc',
      );
      assertSame(
        run('"abc".replace("c", function (m, p) { return p; });'),
        'ab2',
      );
      // The result goes through ToString, and no $ substitution is applied
      // to it (ES5 15.5.4.11: the replacement text is the function's result
      // "converted to a String if need be").
      assertSame(
        run('"abc".replace("b", function () { return 42; });'),
        'a42c',
      );
      assertSame(
        run('"abc".replace("b", function () { return undefined; });'),
        'aundefinedc',
      );
      assertSame(
        run('"abc".replace("b", function () { return "$&"; });'),
        'a$&c',
      );
      assertSame(
        run('"abc".replace("b", function () { return "$$"; });'),
        'a$$c',
      );
      // No match means no call at all.
      assertSame(
        run(
          'var calls = 0; ' +
            'var result = "abc".replace("z", function () { calls += 1; return "X"; }); ' +
            'result + ":" + calls;',
        ),
        'abc:0',
      );
      assertSame(
        run(
          'var calls = 0; ' +
            '"aaa".replace("a", function () { calls += 1; return "X"; }); ' +
            'calls;',
        ),
        1,
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; ' +
            'try { "abc".replace("b", function () { throw thrown; }); } ' +
            'catch (error) { caught = error; } caught === thrown;',
        ),
        true,
      );
    },
  },
  {
    name: 'replace coerces receiver, then search value, then a non-callable replacement, before searching',
    run() {
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "abc"; } }; ' +
            'var search = { toString: function () { order += "s"; return "b"; } }; ' +
            'var replacement = { toString: function () { order += "v"; return "X"; } }; ' +
            'String.prototype.replace.call(receiver, search, replacement) + ":" + order;',
        ),
        'aXc:rsv',
      );
      // A non-callable replacement is converted even when the search finds
      // nothing: the conversion happens before the search, as ES2015+ made
      // explicit and every engine implements.
      assertSame(
        run(
          'var calls = 0; ' +
            'var replacement = { toString: function () { calls += 1; return "X"; } }; ' +
            '"abc".replace("z", replacement) + ":" + calls;',
        ),
        'abc:1',
      );
      assertSame(
        run(
          'var name; try { String.prototype.replace.call(null, "a", "b"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; var reached = false; ' +
            'var search = { toString: function () { throw thrown; } }; ' +
            'var replacement = { toString: function () { reached = true; return "X"; } }; ' +
            'try { "abc".replace(search, replacement); } catch (error) { caught = error; } ' +
            '(caught === thrown) + ":" + reached;',
        ),
        'true:false',
      );
      assertSame(run('String.prototype.replace.call(12321, 2, "X");'), '1X321');
      assertSame(run('new String("abc").replace("b", "X");'), 'aXc');
      assertSame(
        run('var s = "abc"; var out = s.replace("b", "X"); out + "|" + s;'),
        'aXc|abc',
      );
    },
  },
  {
    // ES5 15.5.4.14 with a string separator: SplitMatch is a literal
    // code-unit comparison, and the loop never matches at the very end of
    // the string, so no trailing empty element is invented.
    name: 'split divides a string on a literal separator, keeping adjacent and trailing empties',
    run() {
      assertSame(run('"a,b,c".split(",").join("|");'), 'a|b|c');
      assertSame(run('"a,b,c".split(",").length;'), 3);
      assertSame(run('"a,b,,c".split(",").length;'), 4);
      assertSame(run('"a,b,,c".split(",")[2];'), '');
      assertSame(run('",a,".split(",").length;'), 3);
      assertSame(run('",a,".split(",")[0];'), '');
      assertSame(run('",a,".split(",")[2];'), '');
      assertSame(run('"abc".split("x").length;'), 1);
      assertSame(run('"abc".split("x")[0];'), 'abc');
      assertSame(run('"abc".split("abc").length;'), 2);
      assertSame(run('"abc".split("abc")[0];'), '');
      assertSame(run('"abc".split("abc")[1];'), '');
      assertSame(run('"aaa".split("aa").length;'), 2);
      assertSame(run('"aaa".split("aa")[0];'), '');
      assertSame(run('"aaa".split("aa")[1];'), 'a');
      assertSame(run('"a".split("ab")[0];'), 'a');
      assertSame(run('"ab".split("").join("|");'), 'a|b');
      assertSame(run('"ab".split("").length;'), 2);
      assertSame(run('"\\ud83d\\ude00".split("").length;'), 2);
      assertSame(run('"\\ud83d\\ude00".split("")[0];'), '\ud83d');
      assertSame(run('"\\ud83d\\ude00".split("")[1];'), '\ude00');
      // The empty-string receiver cases of steps 10-11.
      assertSame(run('"".split("").length;'), 0);
      assertSame(run('"".split("x").length;'), 1);
      assertSame(run('"".split("x")[0];'), '');
      assertSame(run('"".split().length;'), 1);
      assertSame(run('"".split()[0];'), '');
      // An undefined separator returns the whole string, without ever
      // treating it as the string "undefined".
      assertSame(run('"abc".split().length;'), 1);
      assertSame(run('"abc".split()[0];'), 'abc');
      assertSame(run('"abc".split(undefined)[0];'), 'abc');
      assertSame(run('"aundefinedb".split(undefined).length;'), 1);
      assertSame(run('"anullb".split(null).join("|");'), 'a|b');
      assertSame(run('"a1b".split(1).join("|");'), 'a|b');
    },
  },
  {
    name: 'split applies ToUint32 to its limit, and coerces the limit before the separator',
    run() {
      assertSame(run('"a,b,c".split(",", 2).join("|");'), 'a|b');
      assertSame(run('"a,b,c".split(",", 1).join("|");'), 'a');
      assertSame(run('"a,b,c".split(",", 0).length;'), 0);
      assertSame(run('"a,b,c".split(",", 5).length;'), 3);
      assertSame(run('"a,b,c".split(",", undefined).length;'), 3);
      assertSame(run('"abc".split(undefined, 0).length;'), 0);
      assertSame(run('"".split("x", 0).length;'), 0);
      assertSame(run('"ab".split("", 1).join("|");'), 'a');
      // ToUint32: NaN and +-0 give 0, fractions truncate, -1 wraps to
      // 4294967295, and 2^32 wraps back to 0.
      assertSame(run('"a,b,c".split(",", NaN).length;'), 0);
      assertSame(run('"a,b,c".split(",", -0).length;'), 0);
      assertSame(run('"a,b,c".split(",", 2.9).length;'), 2);
      assertSame(run('"a,b,c".split(",", -1).length;'), 3);
      assertSame(run('"a,b,c".split(",", 4294967296).length;'), 0);
      assertSame(run('"a,b,c".split(",", 4294967297).length;'), 1);
      assertSame(run('"a,b,c".split(",", "2").length;'), 2);
      assertSame(run('"a,b,c".split(",", true).length;'), 1);
      assertSame(run('"a,b,c".split(",", null).length;'), 0);
      // ES5 15.5.4.14 coerces the limit (step 5) before the separator
      // (step 8).
      assertSame(
        run(
          'var order = ""; ' +
            'var separator = { toString: function () { order += "s"; return ","; } }; ' +
            'var limit = { valueOf: function () { order += "l"; return 2; } }; ' +
            '"a,b,c".split(separator, limit).join("|") + ":" + order;',
        ),
        'a|b:ls',
      );
      assertSame(
        run(
          'var thrown = new Error("boom"); var caught; var reached = false; ' +
            'var separator = { toString: function () { reached = true; return ","; } }; ' +
            'var limit = { valueOf: function () { throw thrown; } }; ' +
            'try { "a,b".split(separator, limit); } catch (error) { caught = error; } ' +
            '(caught === thrown) + ":" + reached;',
        ),
        'true:false',
      );
    },
  },
  {
    name: 'split returns a real Array whose elements are own enumerable properties, and is generic',
    run() {
      assertSame(
        run('Object.prototype.toString.call("a,b".split(","));'),
        '[object Array]',
      );
      assertSame(run('"a,b".split(",") instanceof Array;'), true);
      assertSame(run('Array.isArray("a,b".split(","));'), true);
      assertSame(
        run(
          'var keys = ""; var parts = "a,b".split(","); ' +
            'for (var key in parts) { keys += key + ";"; } keys;',
        ),
        '0;1;',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor("a,b".split(","), "0"); ' +
            'd.value + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'a:true:true:true',
      );
      assertSame(
        run('String.prototype.split.call(12321, 2).join("|");'),
        '1|3|1',
      );
      assertSame(run('new String("a,b").split(",").join("|");'), 'a|b');
      assertSame(
        run(
          'var name; try { String.prototype.split.call(null, ","); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(run('var s = "a,b"; s.split(","); s;'), 'a,b');
    },
  },
  {
    // ES5 15.5.4.10/15.5.4.12 build a RegExp even from a string pattern, so
    // only patterns that contain no RegExp syntax characters can be answered
    // without a RegExp engine. Those behave exactly like a literal search;
    // anything else is refused loudly (see the RegExp-boundary case below).
    name: 'match returns an exec-shaped array for a literal pattern and null when there is no match',
    run() {
      assertSame(
        run(
          'var m = "abcabc".match("b"); ' +
            'm.length + ":" + m[0] + ":" + m.index + ":" + m.input;',
        ),
        '1:b:1:abcabc',
      );
      assertSame(
        run(
          'var m = "abcabc".match("cab"); ' +
            'm.length + ":" + m[0] + ":" + m.index + ":" + m.input;',
        ),
        '1:cab:2:abcabc',
      );
      assertSame(run('"abc".match("z");'), null);
      assertSame(run('"".match("z");'), null);
      assertSame(
        run('Object.prototype.toString.call("abc".match("b"));'),
        '[object Array]',
      );
      assertSame(run('"abc".match("b") instanceof Array;'), true);
      // `new RegExp(undefined)` is the empty pattern, so an omitted or
      // undefined argument matches the empty string at position 0 rather
      // than searching for "undefined".
      assertSame(
        run('var m = "abc".match(); m.length + ":" + m[0] + ":" + m.index;'),
        '1::0',
      );
      assertSame(
        run(
          'var m = "abc".match(undefined); m[0] + ":" + m.index + ":" + m.input;',
        ),
        ':0:abc',
      );
      assertSame(
        run('var m = "".match(""); m.length + ":" + m[0] + ":" + m.index;'),
        '1::0',
      );
      assertSame(run('"aundefinedb".match(undefined).index;'), 0);
      assertSame(run('"abc".match(null);'), null);
      assertSame(run('"anullb".match(null).index;'), 1);
      assertSame(run('"1234".match(23).index;'), 1);
      assertSame(
        run('"abc".match({ toString: function () { return "c"; } }).index;'),
        2,
      );
      assertSame(
        run(
          'var m = "a\\ud83d\\ude00b".match("\\ud83d\\ude00"); ' +
            'm.index + ":" + m[0].length;',
        ),
        '1:2',
      );
      // The descriptors ES5 15.10.6.2 steps 16-19 require.
      assertSame(
        run(
          'var m = "abc".match("b"); ' +
            'var d = Object.getOwnPropertyDescriptor(m, "index"); ' +
            'd.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:true:true',
      );
      assertSame(
        run(
          'var m = "abc".match("b"); ' +
            'var d = Object.getOwnPropertyDescriptor(m, "input"); ' +
            'd.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:true:true',
      );
      assertSame(
        run(
          'var m = "abc".match("b"); ' +
            'var d = Object.getOwnPropertyDescriptor(m, "length"); ' +
            'd.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:false:false',
      );
    },
  },
  {
    name: 'search returns the position of a literal pattern or -1, ignoring any position argument',
    run() {
      assertSame(run('"abcabc".search("b");'), 1);
      assertSame(run('"abcabc".search("cab");'), 2);
      assertSame(run('"abcabc".search("a");'), 0);
      assertSame(run('"abc".search("z");'), -1);
      assertSame(run('"".search("z");'), -1);
      assertSame(run('"abc".search();'), 0);
      assertSame(run('"abc".search(undefined);'), 0);
      assertSame(run('"".search("");'), 0);
      assertSame(run('"abc".search(null);'), -1);
      assertSame(run('"anullb".search(null);'), 1);
      assertSame(run('"1234".search(23);'), 1);
      assertSame(run('"abcabc".search("b", 3);'), 1);
      assertSame(
        run('"abc".search({ toString: function () { return "c"; } });'),
        2,
      );
      assertSame(run('"a\\ud83d\\ude00b".search("\\ude00");'), 2);
    },
  },
  {
    name: 'match, search, replace, and split are generic and coerce their receiver first',
    run() {
      assertSame(run('String.prototype.match.call(12321, 2).index;'), 1);
      assertSame(run('String.prototype.search.call(12321, 32);'), 2);
      assertSame(run('new String("abc").match("b").index;'), 1);
      assertSame(run('new String("abc").search("b");'), 1);
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "abc"; } }; ' +
            'var pattern = { toString: function () { order += "p"; return "b"; } }; ' +
            'String.prototype.search.call(receiver, pattern) + ":" + order;',
        ),
        '1:rp',
      );
      assertSame(
        run(
          'var order = ""; ' +
            'var receiver = { toString: function () { order += "r"; return "abc"; } }; ' +
            'var pattern = { toString: function () { order += "p"; return "b"; } }; ' +
            'String.prototype.match.call(receiver, pattern).index + ":" + order;',
        ),
        '1:rp',
      );

      for (const method of ['match', 'search', 'replace', 'split']) {
        assertSame(
          run(
            `var name; try { String.prototype.${method}.call(null, "a", "b"); } ` +
              'catch (error) { name = error.name; } name;',
          ),
          'TypeError',
          method,
        );
        assertSame(
          run(
            `var name; try { String.prototype.${method}.call(undefined, "a", "b"); } ` +
              'catch (error) { name = error.name; } name;',
          ),
          'TypeError',
          method,
        );
        assertSame(
          run(
            'var thrown = new Error("boom"); var caught; ' +
              'var receiver = { toString: function () { throw thrown; } }; ' +
              `try { String.prototype.${method}.call(receiver, "a", "b"); } ` +
              'catch (error) { caught = error; } caught === thrown;',
          ),
          true,
          method,
        );
      }
    },
  },
  {
    // The RegExp milestone has not landed: there is no RegExp constructor and
    // regular expression literals throw. The pattern methods must therefore
    // refuse a real RegExp object loudly rather than silently ToString-ing it
    // into a literal search, which would answer the wrong question.
    name: 'the pattern methods refuse an object whose class is RegExp instead of treating it as a literal',
    run() {
      for (const source of [
        '"abc".match(tagged);',
        '"abc".search(tagged);',
        '"abc".replace(tagged, "x");',
        '"abc".split(tagged);',
        'String.prototype.match.call("abc", tagged);',
        'String.prototype.split.call("abc", tagged, 5);',
      ]) {
        const { realm } = realmWithTaggedObject('RegExp');
        const error = assertThrows(() => evaluateScript(realm, source), Error);

        assertSame(error.name, 'UnsupportedOperationError', source);
        assertSame(
          /** @type {any} */ (error).operation.indexOf('RegExp') >= 0,
          true,
          `${source} -> ${error.message}`,
        );
      }

      // The refusal is not catchable guest control flow: it is an engine
      // limitation, so it escapes the script rather than becoming a guest
      // error a program could mistake for a specified TypeError.
      const { realm } = realmWithTaggedObject('RegExp');

      assertThrows(
        () =>
          evaluateScript(
            realm,
            'var caught = "none"; try { "abc".match(tagged); } catch (error) { caught = "guest"; } caught;',
          ),
        Error,
      );
    },
  },
  {
    name: 'ordinary objects that merely look like regular expressions are still coerced with ToString',
    run() {
      // Same shape a guest RegExp would have — source/global/exec/lastIndex —
      // but an ordinary [[Class]] of "Object", so ES5's "[[Class]] is
      // RegExp" test does not apply and the pattern is just ToString(value).
      const decorate = (
        /** @type {import('../src/runtime/realm.js').Realm} */ _realm,
        /** @type {EngineObject} */ object,
      ) => {
        for (const [key, value] of [
          ['source', 'b'],
          ['global', false],
          ['lastIndex', 0],
        ]) {
          object.defineOwnProperty(String(key), {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      };

      for (const [source, expected] of [
        ['"abc".search(tagged);', 1],
        ['"abc".replace(tagged, "X");', 'aXc'],
        ['"abc".split(tagged).join("|");', 'a|c'],
        ['"abc".match(tagged).index;', 1],
      ]) {
        const { realm } = realmWithTaggedObject('Object', decorate);

        evaluateScript(realm, 'tagged.toString = function () { return "b"; };');

        assertSame(
          evaluateScript(realm, String(source)).value,
          expected,
          String(source),
        );
      }

      // A boxed String is a "String"-classed object, not a RegExp one.
      assertSame(run('"abc".search(new String("c"));'), 2);
      assertSame(run('"abc".replace(new String("b"), "X");'), 'aXc');
      assertSame(run('"a,b".split(new String(",")).join("|");'), 'a|b');
      // Arrays and functions are not RegExp either.
      assertSame(run('"a,b".split(["", ""]).join("|");'), 'a|b');
      assertSame(run('"abc".search([]);'), 0);
    },
  },
  {
    // Until the RegExp milestone, a *string* pattern for match/search is only
    // answerable when it contains no RegExp syntax character: such a pattern
    // matches itself literally, so the literal search gives exactly what
    // `new RegExp(pattern)` would. Anything else needs a real RegExp engine.
    name: 'match and search refuse a string pattern that would need real RegExp syntax',
    run() {
      for (const source of [
        '"a.c".match(".");',
        '"abc".search("a|b");',
        '"abc".match("a*");',
        '"abc".match("^a");',
        '"abc".search("c$");',
        '"abc".match("(a)");',
        '"abc".match("[abc]");',
        '"abc".match("a{1}");',
        '"abc".search("\\\\d");',
        '"abc".match("a+");',
        '"abc".match("a?");',
      ]) {
        const error = assertThrows(() => run(source), Error);

        assertSame(error.name, 'UnsupportedOperationError', source);
      }

      // The same characters are ordinary text for the string-pattern
      // methods, which never build a RegExp at all.
      assertSame(run('"a.c".replace(".", "X");'), 'aXc');
      assertSame(run('"a.c".split(".").join("|");'), 'a|c');
      assertSame(run('"a|b".split("|").join(";");'), 'a;b');
      assertSame(run('"a$b".replace("$", "X");'), 'aXb');
      assertSame(run('"a\\\\b".split("\\\\")[0];'), 'a');
      // And a pattern without syntax characters is answered normally.
      assertSame(run('"a-c".search("-");'), 1);
      assertSame(run('"a c".match(" ").index;'), 1);
      assertSame(run('"a#c".match("#c").index;'), 1);
    },
  },
  {
    name: 'the pattern methods carry their exact ES5 lengths, names, descriptors, and realm-local identity',
    run() {
      const methodLengths = { match: 1, replace: 2, search: 1, split: 2 };

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

      const first = createRealm();
      const second = createRealm();

      for (const name of Object.keys(methodLengths)) {
        const method = property(
          property(first.globalObject, 'String'),
          'prototype',
        ).get(name);

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
            'foreignMethod.call("abc", "b", "x") !== undefined;',
          ).value,
          true,
          `${name} must still be callable from another realm`,
        );
      }

      // An array produced by a foreign realm's split still comes from that
      // realm's Array prototype, not the calling realm's.
      const arraySource = property(
        property(first.globalObject, 'String'),
        'prototype',
      ).get('split');

      second.globalObject.defineOwnProperty('foreignSplit', {
        value: arraySource,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(
          second,
          'foreignSplit.call("a,b", ",") instanceof Array;',
        ).value,
        false,
      );
    },
  },
];

export default tests;
