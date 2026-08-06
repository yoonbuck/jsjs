import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { STATEMENT_TYPES } from '../src/evaluator/statements.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const realm = createRealm();
  return evaluateScript(realm, source).value;
}

/**
 * Assert that `completion` is a guest throw whose value inherits from the
 * named constructor's `.prototype`.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @returns {void}
 */
function assertGuestThrow(completion, constructorName, realm) {
  assertSame(completion.type, 'throw');
  if (!(completion.value instanceof EngineObject)) {
    throw new Error(
      `Expected an EngineObject throw value, got ${typeof completion.value}`,
    );
  }

  const ctor = /** @type {any} */ (realm.globalObject.get(constructorName));
  const proto = /** @type {EngineObject} */ (ctor.get('prototype'));

  let current = /** @type {EngineObject | null} */ (
    /** @type {EngineObject} */ (completion.value).getPrototype()
  );
  while (current !== null) {
    if (current === proto) {
      return;
    }
    current = current.getPrototype();
  }

  throw new Error(
    `Thrown value's prototype chain does not reach ${constructorName}.prototype`,
  );
}

const tests = [
  {
    name: 'WithStatement is a recognized statement node type',
    run() {
      assertSame(STATEMENT_TYPES.has('WithStatement'), true);
    },
  },
  {
    name: 'with resolves identifiers against the binding object',
    run() {
      assertSame(run('var o = { a: 41 }; var r; with (o) { r = a; } r;'), 41);
    },
  },
  {
    name: 'assignment inside with writes back to a shadowing property of the object',
    run() {
      assertSame(run('var o = { a: 1 }; with (o) { a = 5; } o.a;'), 5);
    },
  },
  {
    name: 'with sets provideThis so a method call sees this as the binding object',
    run() {
      assertSame(
        run(
          'var o = { m: function () { return this === o; } }; ' +
            'var r; with (o) { r = m(); } r;',
        ),
        true,
      );
      assertSame(
        run(
          'var o = { v: 7, m: function () { return this.v; } }; ' +
            'var r; with (o) { r = m(); } r;',
        ),
        7,
      );
    },
  },
  {
    name: 'var declarations inside with hoist to the variable environment without leaking to the global',
    run() {
      // Proper hoisting makes `y` a function-local var: it is returned but is
      // not created on the global object. Without hoisting the non-strict
      // assignment would leak `y` to the global instead.
      assertSame(
        run(
          '(function () { with ({}) { var y = 9; } return y; })() + "," + typeof y;',
        ),
        '9,undefined',
      );
    },
  },
  {
    name: 'a hoisted var shadowed by the with object reads and writes through the object',
    run() {
      assertSame(
        run(
          '(function () { var out = []; with ({ x: 1 }) { var x; out.push(x); ' +
            'x = 5; out.push(x); } out.push(typeof x); return out.join(","); })();',
        ),
        '1,5,undefined',
      );
    },
  },
  {
    name: 'var declarations inside with hoist at global scope',
    run() {
      assertSame(
        run('with ({}) { var hoistedThroughWith = 5; } hoistedThroughWith;'),
        5,
      );
    },
  },
  {
    name: 'function declarations inside with hoist through the with body',
    run() {
      assertSame(run('with ({}) { function g() { return 7; } } g();'), 7);
    },
  },
  {
    name: 'delete inside with removes the property from the binding object',
    run() {
      assertSame(
        run(
          'var o = { a: 1 }; var r; with (o) { r = delete a; } r + ":" + o.hasOwnProperty("a");',
        ),
        'true:false',
      );
    },
  },
  {
    name: 'with (null) and with (undefined) throw a guest TypeError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, 'with (null) {}'),
        'TypeError',
        realm,
      );
      assertGuestThrow(
        evaluateScript(realm, 'with (undefined) {}'),
        'TypeError',
        realm,
      );
      assertGuestThrow(
        evaluateScript(realm, 'with (void 0) {}'),
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'the with statement completion value is its body value with empty replaced by undefined',
    run() {
      assertSame(run('with ({}) { 7; }'), 7);
      assertSame(run('with ({}) {}'), undefined);
      // An empty with body replaces a prior meaningful value with undefined,
      // matching real engines (ES2015 13.11.7 UpdateEmpty), as the engine's
      // try statement already does.
      assertSame(run('5; with ({}) {}'), undefined);
    },
  },
  {
    name: 'the with environment is restored after a normal completion',
    run() {
      assertSame(run('var o = { a: 1 }; with (o) {} typeof a;'), 'undefined');
    },
  },
  {
    name: 'an abrupt with body threads the surrounding loop completion value (ES5.1 12.10 with 13.11.7)',
    run() {
      // Regression for the upstream `with/cptn-abrupt-empty` behaviour: a
      // `break`/`continue` out of a `with` body carries the last meaningful
      // value the loop produced, and an empty body value becomes undefined.
      assertSame(
        run('1; do { 2; with ({}) { 3; break; } 4; } while (false);'),
        3,
      );
      assertSame(
        run('5; do { 6; with ({}) { break; } 7; } while (false);'),
        undefined,
      );
      assertSame(
        run('8; do { 9; with ({}) { 10; continue; } 11; } while (false);'),
        10,
      );
      assertSame(
        run('12; do { 13; with ({}) { continue; } 14; } while (false);'),
        undefined,
      );
    },
  },
  {
    name: 'the with environment is restored after a thrown exception',
    run() {
      assertSame(
        run(
          'var o = { a: 1 }; try { with (o) { throw 0; } } catch (e) {} typeof a;',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'break and continue cross the with environment and restore it',
    run() {
      // `continue` skips the trailing `n = n + 100`; the loop ends at n === 3.
      assertSame(
        run(
          'var o = { a: 1 }; var n = 0; while (n < 3) { with (o) { n = n + 1; ' +
            'if (a) continue; } n = n + 100; } n;',
        ),
        3,
      );
      // `break` leaves the loop through the with body; `a` is not visible after.
      assertSame(
        run(
          'var o = { a: 1 }; while (true) { with (o) { if (a) break; } } typeof a;',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'return inside with returns the resolved value',
    run() {
      assertSame(
        run('(function () { var o = { a: 7 }; with (o) { return a; } })();'),
        7,
      );
    },
  },
  {
    name: 'return through with restores the environment before an enclosing finally runs',
    run() {
      // ES5.1 12.10: the `with` object environment must be discarded on the
      // abrupt `return` completion, so the enclosing `finally` — which runs
      // outside the `with` — no longer resolves `a` against the binding
      // object. `typeof` yields "undefined" for the now-free identifier; a
      // leaked environment would resolve it to `o.a` and yield "number".
      assertSame(
        run(
          'var seen;' +
            'var result = (function () {' +
            '  var o = { a: 1 };' +
            '  try { with (o) { return 7; } } finally { seen = typeof a; }' +
            '})();' +
            'result + ":" + seen;',
        ),
        '7:undefined',
      );
    },
  },
  {
    name: 'nested with statements resolve against the innermost object first',
    run() {
      assertSame(
        run(
          'var o1 = { a: 1 }; var o2 = { b: 2 }; var r; with (o1) { with (o2) { r = a + b; } } r;',
        ),
        3,
      );
      assertSame(
        run(
          'var o1 = { x: 1 }; var o2 = { x: 2 }; var r; with (o1) { with (o2) { r = x; } } r;',
        ),
        2,
      );
    },
  },
  {
    name: 'a function closure created inside with captures the object environment',
    run() {
      assertSame(
        run(
          'var o = { a: 5 }; var f; with (o) { f = function () { return a; }; } f();',
        ),
        5,
      );
      // The captured binding stays live against the object.
      assertSame(
        run(
          'var o = { a: 5 }; var f; with (o) { f = function () { return a; }; } o.a = 9; f();',
        ),
        9,
      );
    },
  },
  {
    name: 'a strict-mode script rejects with at parse time',
    run() {
      const realm = createRealm();
      assertThrows(
        () => evaluateScript(realm, '"use strict"; with ({}) {}'),
        SyntaxError,
      );
    },
  },
  {
    name: 'a direct eval from strict code rejects with as a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, '"use strict"; eval("with ({}) {}");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a var binding is resolved before its initializer runs (ES5.1 §12.2)',
    run() {
      // Inside `with (obj)` the reference for `test262id` binds to `obj`
      // *before* the initializer runs (§12.2.1: evaluate the Identifier, then
      // the Initialiser, then PutValue). The initializer deletes the property,
      // but PutValue writes back through the already-captured reference, so it
      // reappears on `obj` and the outer `var` is never touched. jsjs used to
      // evaluate the initializer first, so the binding fell through to the
      // global. JavaScriptCore agrees with the order asserted here.
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var obj = { test262id: 1 };' +
          'with (obj) { var test262id = delete obj.test262id; }' +
          '"" + obj.test262id + "," + (typeof test262id);',
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'true,undefined');
    },
  },
];

export default tests;
