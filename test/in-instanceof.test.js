import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * Runs `source` in a fresh realm and returns the completion record.
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
 * Assert the completion is a throw completion whose value's prototype chain
 * includes the named constructor's `.prototype`.
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
  // `in` — own properties
  // ---------------------------------------------------------------------------
  {
    name: 'in: own property found returns true',
    run() {
      assertNormal(run("var o = { x: 1 }; 'x' in o;"), true);
    },
  },
  {
    name: 'in: own property absent returns false',
    run() {
      assertNormal(run("var o = { x: 1 }; 'y' in o;"), false);
    },
  },

  // ---------------------------------------------------------------------------
  // `in` — prototype-chain property
  // ---------------------------------------------------------------------------
  {
    name: 'in: inherited property found returns true',
    run() {
      assertNormal(
        run(
          "function F() {} F.prototype.foo = 42; var o = new F(); 'foo' in o;",
        ),
        true,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // `in` — array indices
  // ---------------------------------------------------------------------------
  {
    name: 'in: array index present returns true',
    run() {
      assertNormal(run('0 in [1, 2];'), true);
    },
  },
  {
    name: 'in: array index absent returns false',
    run() {
      assertNormal(run('5 in [1, 2];'), false);
    },
  },

  // ---------------------------------------------------------------------------
  // `in` — non-object right-hand side throws TypeError
  // ---------------------------------------------------------------------------
  {
    name: 'in: number rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      const c = evaluateScript(
        realm,
        "var e; try { 'x' in 42; } catch (err) { e = err; } e.name;",
      );
      assertSame(c.type, 'normal');
      assertSame(c.value, 'TypeError');
    },
  },
  {
    name: 'in: string rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      const c = evaluateScript(
        realm,
        "var e; try { 'x' in 'str'; } catch (err) { e = err; } e.name;",
      );
      assertSame(c.type, 'normal');
      assertSame(c.value, 'TypeError');
    },
  },
  {
    name: 'in: null rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      const c = evaluateScript(
        realm,
        "var e; try { 'x' in null; } catch (err) { e = err; } e.name;",
      );
      assertSame(c.type, 'normal');
      assertSame(c.value, 'TypeError');
    },
  },
  {
    name: 'in: undefined rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      const c = evaluateScript(
        realm,
        "var e; try { 'x' in undefined; } catch (err) { e = err; } e.name;",
      );
      assertSame(c.type, 'normal');
      assertSame(c.value, 'TypeError');
    },
  },
  {
    name: 'in: boolean rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      const c = evaluateScript(
        realm,
        "var e; try { 'x' in true; } catch (err) { e = err; } e.name;",
      );
      assertSame(c.type, 'normal');
      assertSame(c.value, 'TypeError');
    },
  },
  {
    name: 'in: non-object rhs TypeError is catchable as guest TypeError instance',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, "'x' in 42;"),
        'TypeError',
        realm,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // `instanceof` — basic
  // ---------------------------------------------------------------------------
  {
    name: 'instanceof: instance created by new F reports true for F',
    run() {
      assertNormal(
        run('function F() {} var o = new F(); o instanceof F;'),
        true,
      );
    },
  },
  {
    name: 'instanceof: instance of F reports false for unrelated G',
    run() {
      assertNormal(
        run('function F() {} function G() {} var o = new F(); o instanceof G;'),
        false,
      );
    },
  },
  {
    name: 'instanceof: non-object value (number) always returns false',
    run() {
      assertNormal(
        run('function F() {} 42 instanceof F;'),
        false,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // `instanceof` — prototype chain walk
  // ---------------------------------------------------------------------------
  {
    name: 'instanceof: two-level chain: instance instanceof Base is true',
    run() {
      assertNormal(
        run(
          'function Base() {}\n' +
          'function Derived() {}\n' +
          'Derived.prototype = new Base();\n' +
          'var o = new Derived();\n' +
          'o instanceof Base;',
        ),
        true,
      );
    },
  },
  {
    name: 'instanceof: two-level chain: instance instanceof Derived is true',
    run() {
      assertNormal(
        run(
          'function Base() {}\n' +
          'function Derived() {}\n' +
          'Derived.prototype = new Base();\n' +
          'var o = new Derived();\n' +
          'o instanceof Derived;',
        ),
        true,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // `instanceof` — non-object rhs throws TypeError
  // ---------------------------------------------------------------------------
  {
    name: 'instanceof: number rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, 'var o = {}; o instanceof 42;'),
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'instanceof: null rhs throws guest TypeError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, 'var o = {}; o instanceof null;'),
        'TypeError',
        realm,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // `instanceof` — non-callable object rhs throws TypeError (ES5 rule)
  // ---------------------------------------------------------------------------
  {
    name: 'instanceof: plain object rhs (no [[HasInstance]]) throws guest TypeError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, 'var o = {}; var p = {}; o instanceof p;'),
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'instanceof: plain object rhs TypeError is catchable by name',
    run() {
      const realm = createRealm();
      const c = evaluateScript(
        realm,
        "var e; try { var o = {}; o instanceof {}; } catch (err) { e = err; } e.name;",
      );
      assertSame(c.type, 'normal');
      assertSame(c.value, 'TypeError');
    },
  },
];

export default tests;
