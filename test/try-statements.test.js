import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * Runs `source` and returns the completion record (type + value).
 *
 * @param {string} source
 * @returns {{ type: string, value: unknown }}
 */
function run(source) {
  return evaluateScript(createRealm(), source);
}

/**
 * Assert the completion is a normal completion with the given value.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 */
function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * Assert the completion is a throw completion carrying a guest error whose
 * prototype chain includes the named constructor's prototype.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 * @param {import('../src/runtime/realm.js').Realm} realm
 */
function assertGuestThrow(completion, constructorName, realm) {
  assertSame(completion.type, 'throw');
  if (!(completion.value instanceof EngineObject)) {
    throw new Error(
      `Expected EngineObject throw value, got ${typeof completion.value}`,
    );
  }
  const ctor = /** @type {any} */ (realm.globalObject.get(constructorName));
  const proto = /** @type {EngineObject} */ (ctor.get('prototype'));
  let cur = /** @type {EngineObject | null} */ (
    /** @type {EngineObject} */ (completion.value).getPrototype()
  );
  while (cur !== null) {
    if (cur === proto) return;
    cur = cur.getPrototype();
  }
  throw new Error(`Thrown value is not an instance of ${constructorName}`);
}

const tests = [
  // ---------------------------------------------------------------------------
  // try/catch — direct throw
  // ---------------------------------------------------------------------------
  {
    name: 'try/catch catches a direct throw in the try block',
    run() {
      assertNormal(
        run('var x = 0; try { throw 42; } catch (e) { x = e; } x'),
        42,
      );
    },
  },
  {
    name: 'try/catch result value is the catch-block value when try threw',
    run() {
      assertNormal(run('try { throw 1; } catch (e) { e + 10; }'), 11);
    },
  },
  {
    name: 'ES5 catch returns empty normal, break, and continue completions unchanged',
    run() {
      assertNormal(run('1; try { throw null; } catch (e) {}'), 1);
      assertNormal(run('1; try { throw null; } catch (e) {} finally {}'), 1);
      assertNormal(
        run(
          "for (var i = 0; i < 2; ++i) { if (i) { try { throw null; } catch (e) { break; } } 'prior'; }",
        ),
        'prior',
      );
      assertNormal(
        run(
          "for (var i = 0; i < 2; ++i) { if (i) { try { throw null; } catch (e) { continue; } } 'prior'; }",
        ),
        'prior',
      );
    },
  },
  {
    name: 'catch block is skipped when try does not throw',
    run() {
      assertNormal(run('var x = 0; try { x = 1; } catch (e) { x = 99; } x'), 1);
    },
  },

  // ---------------------------------------------------------------------------
  // try/catch — ThrowSignal from nested function call
  // ---------------------------------------------------------------------------
  {
    name: 'try/catch catches a ThrowSignal that escapes a nested function call',
    run() {
      const source = `
        function boom() { throw 'oops'; }
        var caught;
        try { boom(); } catch (e) { caught = e; }
        caught
      `;
      assertNormal(run(source), 'oops');
    },
  },

  // ---------------------------------------------------------------------------
  // try/catch — guest engine errors (GuestErrorSignal / checkObjectCoercible)
  // ---------------------------------------------------------------------------
  {
    name: 'try/catch catches a guest TypeError from null member access',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'try { null.foo; } catch (e) { e; }',
      );
      assertSame(result.type, 'normal');
      assertGuestThrow(
        { type: 'throw', value: result.value },
        'TypeError',
        realm,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // try/finally — no exception
  // ---------------------------------------------------------------------------
  {
    name: 'try/finally: finally still runs when try does not throw',
    run() {
      assertNormal(
        run('var x = 0; try { x = 1; } finally { x = x + 10; } x'),
        11,
      );
    },
  },
  {
    name: 'try/finally: normal try result passes through when finally is normal',
    run() {
      assertNormal(run('try { 42; } finally { 0; }'), 42);
    },
  },

  // ---------------------------------------------------------------------------
  // try/finally — try throws, finally is normal
  // ---------------------------------------------------------------------------
  {
    name: 'try/finally: throw propagates after finally runs normally',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var x = 0; try { throw 5; } finally { x = 99; }',
      );
      assertSame(result.type, 'throw');
      assertSame(result.value, 5);
    },
  },

  // ---------------------------------------------------------------------------
  // try/finally — finally's abrupt completion overrides try's
  // ---------------------------------------------------------------------------
  {
    name: 'try/finally: finally return overrides try throw',
    run() {
      assertNormal(
        run('function f() { try { throw 1; } finally { return 2; } } f()'),
        2,
      );
    },
  },
  {
    name: 'try/finally: finally throw overrides try break inside a loop',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'while (true) { try { break; } finally { throw 99; } }',
      );
      assertSame(result.type, 'throw');
      assertSame(result.value, 99);
    },
  },

  // ---------------------------------------------------------------------------
  // try/catch/finally — combined
  // ---------------------------------------------------------------------------
  {
    name: 'try/catch/finally: catch runs then finally runs; normal catch result passes through',
    run() {
      assertNormal(
        run('try { throw 1; } catch (e) { e + 5; } finally { 0; }'),
        6,
      );
    },
  },
  {
    name: 'try/catch/finally: finally abrupt completion overrides catch result',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'try { throw 1; } catch (e) { e; } finally { throw 99; }',
      );
      assertSame(result.type, 'throw');
      assertSame(result.value, 99);
    },
  },
  {
    name: 'try/catch/finally: no throw means catch is skipped, finally still runs',
    run() {
      assertNormal(
        run(
          'var x = 0; try { x = 1; } catch (e) { x = 99; } finally { x = x + 10; } x',
        ),
        11,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // catch-clause parameter shadowing
  // ---------------------------------------------------------------------------
  {
    name: 'catch parameter shadows an outer binding for duration of catch block',
    run() {
      const source = `
        var e = 'outer';
        try { throw 'inner'; } catch (e) { /* e is 'inner' here */ }
        e
      `;
      assertNormal(run(source), 'outer');
    },
  },
  {
    name: 'catch parameter is accessible inside the catch block',
    run() {
      assertNormal(
        run("var r; try { throw 'caught'; } catch (e) { r = e; } r"),
        'caught',
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Nested try/finally
  // ---------------------------------------------------------------------------
  {
    name: 'nested try/finally: inner finally runs before outer catch sees throw',
    run() {
      const source = `
        var log = '';
        try {
          try { throw 1; } finally { log = log + 'inner'; }
        } catch (e) { log = log + 'catch'; }
        log
      `;
      assertNormal(run(source), 'innercatch');
    },
  },
  {
    name: 'nested try/finally: completions propagate correctly through multiple levels',
    run() {
      const source = `
        function f() {
          try {
            try { return 1; } finally { /* normal */ }
          } finally { /* normal */ }
        }
        f()
      `;
      assertNormal(run(source), 1);
    },
  },

  // ---------------------------------------------------------------------------
  // Rethrow
  // ---------------------------------------------------------------------------
  {
    name: 'rethrow: catch(e){throw e} propagates as a throw completion',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'try { throw 7; } catch (e) { throw e; }',
      );
      assertSame(result.type, 'throw');
      assertSame(result.value, 7);
    },
  },
  {
    name: 'rethrow: inner rethrow is caught by outer try',
    run() {
      assertNormal(
        run(
          'var r; try { try { throw 7; } catch (e) { throw e; } } catch (e2) { r = e2; } r',
        ),
        7,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Error-site sweep: checkObjectCoercible (null/undefined member access)
  // ---------------------------------------------------------------------------
  {
    name: 'null member access inside try produces a guest TypeError catchable by catch',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var r; try { null.x; } catch (e) { r = e; } r;',
      );
      assertSame(result.type, 'normal');
      assertGuestThrow(
        { type: 'throw', value: result.value },
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'undefined member access inside try produces a guest TypeError catchable by catch',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var r; try { undefined.x; } catch (e) { r = e; } r;',
      );
      assertSame(result.type, 'normal');
      assertGuestThrow(
        { type: 'throw', value: result.value },
        'TypeError',
        realm,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Error-site sweep: Invalid array length (RangeError)
  // ---------------------------------------------------------------------------
  {
    name: 'assigning invalid array length inside try produces a guest RangeError catchable by catch',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var r; try { var a = []; a.length = -1; } catch (e) { r = e; } r;',
      );
      assertSame(result.type, 'normal');
      assertGuestThrow(
        { type: 'throw', value: result.value },
        'RangeError',
        realm,
      );
    },
  },
];

export default tests;
