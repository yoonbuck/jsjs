import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function run(realm, source) {
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
    name: 'RegExp.prototype.exec has length 1 and the standard method descriptor',
    run() {
      const realm = createRealm();
      assertSame(run(realm, 'RegExp.prototype.exec.length;'), 1);

      const proto = /** @type {any} */ (realm.intrinsics.regExpConstructor).get(
        'prototype',
      );
      const descriptor = proto.getOwnProperty('exec');
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'RegExp.prototype.test has length 1 and the standard method descriptor',
    run() {
      const realm = createRealm();
      assertSame(run(realm, 'RegExp.prototype.test.length;'), 1);

      const proto = /** @type {any} */ (realm.intrinsics.regExpConstructor).get(
        'prototype',
      );
      const descriptor = proto.getOwnProperty('test');
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'RegExp.prototype.toString has length 0 and the standard method descriptor',
    run() {
      const realm = createRealm();
      assertSame(run(realm, 'RegExp.prototype.toString.length;'), 0);

      const proto = /** @type {any} */ (realm.intrinsics.regExpConstructor).get(
        'prototype',
      );
      const descriptor = proto.getOwnProperty('toString');
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'exec on a non-RegExp receiver throws a guest TypeError',
    run() {
      const realm = createRealm();
      const isTypeError = /** @type {any} */ (
        evaluateScript(
          realm,
          'try { RegExp.prototype.exec.call({}); } catch (e) { e instanceof TypeError; }',
        )
      ).value;
      assertSame(isTypeError, true);
    },
  },
  {
    name: 'exec with no string argument searches the literal text "undefined"',
    run() {
      const realm = createRealm();
      assertSame(run(realm, '/undefined/.exec()[0];'), 'undefined');
      assertSame(run(realm, '/xyz/.exec() === null;'), true);
    },
  },
  {
    name: 'a non-global regexp ignores lastIndex on entry and never writes it',
    run() {
      const realm = createRealm();
      assertSame(
        run(realm, 'var r = /a/; r.lastIndex = 3; r.exec("aaa").index;'),
        0,
      );
      assertSame(
        run(realm, 'var r = /a/; r.lastIndex = 3; r.exec("aaa"); r.lastIndex;'),
        3,
      );
    },
  },
  {
    name: 'a global regexp walks lastIndex across successive exec calls and resets it to 0 on failure',
    run() {
      const realm = createRealm();
      assertSame(
        run(
          realm,
          'var r = /a/g; var out = []; var m; ' +
            'while ((m = r.exec("aaa")) !== null) { out.push(m.index); } ' +
            'out.join(",") + ":" + r.lastIndex;',
        ),
        '0,1,2:0',
      );
    },
  },
  {
    name: "an empty match does not advance lastIndex on its own; a caller (Task 3's String.prototype.match) must bump it manually",
    run() {
      const realm = createRealm();
      assertSame(
        run(
          realm,
          'var r = /(?:)/g; var out = []; var m; ' +
            'for (var i = 0; i < 3; i++) { ' +
            '  m = r.exec("ab"); ' +
            '  out.push(m.index + ":" + r.lastIndex); ' +
            '  r.lastIndex += 1; ' +
            '} ' +
            'm = r.exec("ab"); ' +
            'out.join("|") + "|" + (m === null) + ":" + r.lastIndex;',
        ),
        '0:0|1:1|2:2|true:0',
      );
      assertSame(
        run(
          realm,
          'var r = /(?:)/g; var first = r.exec("ab"); var second = r.exec("ab"); ' +
            'first.index + ":" + second.index + ":" + r.lastIndex;',
        ),
        '0:0:0',
        'without a manual lastIndex bump, repeated exec calls keep matching at the same position',
      );
    },
  },
  {
    name: 'lastIndex beyond the string length returns null and resets lastIndex to 0',
    run() {
      const realm = createRealm();
      assertSame(
        run(
          realm,
          'var r = /a/g; r.lastIndex = 10; var result = r.exec("aaa"); ' +
            '(result === null) + ":" + r.lastIndex;',
        ),
        'true:0',
      );
    },
  },
  {
    name: 'a negative lastIndex returns null and resets lastIndex to 0',
    run() {
      const realm = createRealm();
      assertSame(
        run(
          realm,
          'var r = /a/g; r.lastIndex = -1; var result = r.exec("aaa"); ' +
            '(result === null) + ":" + r.lastIndex;',
        ),
        'true:0',
      );
    },
  },
  {
    name: 'lastIndex coerces with ToInteger, including string and valueOf-object forms',
    run() {
      const realm = createRealm();
      assertSame(
        run(realm, 'var r = /a/g; r.lastIndex = "2"; r.exec("aaaa").index;'),
        2,
      );
      assertSame(
        run(
          realm,
          'var r = /a/g; r.lastIndex = { valueOf: function () { return 1; } }; ' +
            'r.exec("aaaa").index;',
        ),
        1,
      );
    },
  },
  {
    name: 'a throwing lastIndex valueOf propagates as a guest throw out of exec',
    run() {
      const realm = createRealm();
      const value = /** @type {any} */ (
        evaluateScript(
          realm,
          'var r = /a/g; ' +
            'r.lastIndex = { valueOf: function () { throw new RangeError("boom"); } }; ' +
            'try { r.exec("aaaa"); } catch (e) { e instanceof RangeError; }',
        )
      ).value;
      assertSame(value, true);
    },
  },
  {
    name: 'exec throws a guest TypeError when lastIndex has been made non-writable',
    run() {
      const realm = createRealm();
      const value = /** @type {any} */ (
        evaluateScript(
          realm,
          'var r = /a/g; ' +
            'Object.defineProperty(r, "lastIndex", { writable: false }); ' +
            'try { r.exec("aaa"); false; } catch (e) { e instanceof TypeError; }',
        )
      ).value;
      assertSame(value, true);
    },
  },
  {
    name: 'multiline: ^ and $ match at internal line boundaries, only when the m flag is present',
    run() {
      const realm = createRealm();
      assertSame(run(realm, '/^b/m.exec("a\\nb").index;'), 2);
      assertSame(run(realm, '/^b/.exec("a\\nb") === null;'), true);
      assertSame(run(realm, '/b$/m.exec("ab\\nc")[0];'), 'b');
      assertSame(run(realm, '/^b/m.exec("a\\rb").index;'), 2);
      assertSame(run(realm, '/^b/m.exec("a\\u2028b").index;'), 2);
      assertSame(run(realm, '/^b/m.exec("a\\u2029b").index;'), 2);
    },
  },
  {
    name: 'case-insensitive matching follows ES5 15.10.2.8 single-character Canonicalize',
    run() {
      const realm = createRealm();
      assertSame(run(realm, '/Ab/i.test("aB");'), true);
      assertSame(run(realm, '/\\u00df/i.test("SS");'), false);
    },
  },
  {
    name: 'captures: a group inside a quantifier that stops participating resets to undefined',
    run() {
      const realm = createRealm();
      assertSame(
        run(
          realm,
          'var m = /(a)(b)?/.exec("a"); ' +
            'm.length + ":" + m[0] + ":" + m[1] + ":" + (m[2] === undefined) + ":" + m.index + ":" + m.input;',
        ),
        '3:a:a:true:0:a',
      );
    },
  },
  {
    name: 'backreferences match prior captures, and a backreference to a non-participating group matches empty',
    run() {
      const realm = createRealm();
      assertSame(run(realm, '/(a)\\1/.test("aa");'), true);
      assertSame(run(realm, '/(a)\\1/.test("ab");'), false);
      assertSame(run(realm, '/(x)?\\1y/.test("y");'), true);
    },
  },
  {
    name: 'the exec result is a genuine, extensible Array with %Array.prototype% as its prototype',
    run() {
      const realm = createRealm();
      assertSame(run(realm, 'Array.isArray(/a/.exec("a"));'), true);
      assertSame(
        run(realm, 'Object.getPrototypeOf(/a/.exec("a")) === Array.prototype;'),
        true,
      );
      assertSame(
        run(
          realm,
          'var m = /a/.exec("a"); m.push("x"); m.length + ":" + m[1];',
        ),
        '2:x',
      );
    },
  },
  {
    name: 'RegExp.prototype.test returns a boolean using the exec algorithm, immune to guest overrides of exec',
    run() {
      const realm = createRealm();
      assertSame(run(realm, '/a/.test("a");'), true);
      assertSame(run(realm, '/a/.test("b");'), false);
      assertSame(
        run(
          realm,
          'var r = /a/; RegExp.prototype.exec = function () { return "not the real exec"; }; r.test("a");',
        ),
        true,
      );
    },
  },
  {
    name: 'RegExp.prototype.toString returns /source/flags in fixed gim order',
    run() {
      const realm = createRealm();
      assertSame(run(realm, 'RegExp.prototype.toString();'), '/(?:)/');
      assertSame(run(realm, 'new RegExp("a").toString();'), '/a/');
      assertSame(run(realm, 'new RegExp("a", "gim").toString();'), '/a/gim');
      assertSame(
        run(realm, 'new RegExp("a", "mig").toString();'),
        '/a/gim',
        'flag order in the source text must not affect the fixed gim output order',
      );
      assertSame(run(realm, '/x/i.toString();'), '/x/i');
    },
  },
  {
    name: 'RegExp.prototype.toString requires a RegExp receiver',
    run() {
      const realm = createRealm();
      const value = /** @type {any} */ (
        evaluateScript(
          realm,
          'try { RegExp.prototype.toString.call({}); } catch (e) { e instanceof TypeError; }',
        )
      ).value;
      assertSame(value, true);
    },
  },
  {
    name: 'a regular expression literal evaluates to a fresh RegExp object on every evaluation',
    run() {
      const realm = createRealm();
      assertSame(run(realm, 'function f() { return /a/; } f() !== f();'), true);
      assertSame(
        run(realm, 'Object.prototype.toString.call(/ab/gi);'),
        '[object RegExp]',
      );
      assertSame(run(realm, '/ab/gi.source;'), 'ab');
      assertSame(run(realm, '/ab/gi.global;'), true);
      assertSame(run(realm, '/ab/gi.ignoreCase;'), true);
      assertSame(run(realm, '/ab/gi.multiline;'), false);
    },
  },
  {
    name: 'a pattern the ES5 grammar rejects but the host parser accepts is an early error at the literal',
    run() {
      // Acorn accepts `/]/` and `/{/` because the host grammar is Annex
      // B-permissive, so the ES5.1 §7.8.5 requirement that the failed
      // `new RegExp(Pattern, Flags)` "be treated as an early error" is met by
      // this engine's own parse-time pass. `evaluateScript` therefore rejects
      // the whole script before running any of it, rather than producing a
      // throw completion when the literal expression is reached.
      const realm = createRealm();

      assertThrows(() => evaluateScript(realm, '/]/;'), SyntaxError);
      assertThrows(() => evaluateScript(realm, '/{/;'), SyntaxError);
      assertThrows(
        () => evaluateScript(realm, 'function unused() { return /]/; }'),
        SyntaxError,
      );

      // Reached through `eval`, the same early error becomes a *guest*
      // SyntaxError the running program can catch.
      assertSame(
        /** @type {any} */ (
          evaluateScript(
            realm,
            '(function () { try { eval("/]/;"); return "no throw"; }' +
              ' catch (e) { return e instanceof SyntaxError; } })();',
          )
        ).value,
        true,
      );
    },
  },
];

export default tests;
