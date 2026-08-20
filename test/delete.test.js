import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

class RefusingDeleteObject extends EngineObject {
  /**
   * @returns {boolean}
   */
  delete() {
    return false;
  }
}

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
 * Runs `source` against an existing realm and returns the completion record.
 *
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {{ type: string, value: unknown }}
 */
function runIn(realm, source) {
  return evaluateScript(realm, source);
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
    /** @type {EngineObject} */ (completion.value).getPrototypeOf()
  );

  while (cur !== null) {
    if (cur === proto) return;
    cur = cur.getPrototypeOf();
  }

  throw new Error(`Thrown value is not an instance of ${constructorName}`);
}

const tests = [
  // ---------------------------------------------------------------------------
  // delete of own configurable property
  // ---------------------------------------------------------------------------
  {
    name: 'delete own configurable property returns true and removes it',
    run() {
      assertNormal(run('var o = { x: 1 }; var r = delete o.x; r;'), true);
      assertNormal(run("var o = { x: 1 }; delete o.x; 'x' in o;"), false);
    },
  },

  // ---------------------------------------------------------------------------
  // delete of non-configurable property
  // ---------------------------------------------------------------------------
  {
    name: 'delete non-configurable property in non-strict code returns false',
    run() {
      // length on an array is non-configurable
      assertNormal(run('var a = [1, 2, 3]; delete a.length;'), false);
    },
  },
  {
    name: 'delete non-configurable property in strict code throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '"use strict"; var a = [1, 2, 3]; delete a.length;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'strict and sloppy delete own false results in synchronous and generator evaluation',
    run() {
      const realm = createRealm();
      const target = new RefusingDeleteObject(realm.intrinsics.objectPrototype);
      realm.globalObject.defineOwnProperty('target', {
        value: target,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertNormal(runIn(realm, 'delete target.value;'), false);

      const strict = runIn(realm, '"use strict"; delete target.value;');
      assertGuestThrow(strict, 'TypeError', realm);

      assertSame(
        runIn(
          realm,
          'var generator = (function* () { return delete target.value; })(); ' +
            'generator.next().value;',
        ).value,
        false,
      );
      const generatorStrict = runIn(
        realm,
        'var generator = (function* () { "use strict"; return delete target.value; })(); ' +
          'var caught; try { generator.next(); } catch (error) { caught = error; } caught;',
      );
      assertSame(
        /** @type {EngineObject} */ (generatorStrict.value).getPrototypeOf(),
        realm.intrinsics.typeErrorPrototype,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // delete of array index
  // ---------------------------------------------------------------------------
  {
    name: 'delete array index removes the element and returns true',
    run() {
      assertNormal(run('var a = [1, 2, 3]; var r = delete a[1]; r;'), true);
      assertNormal(run("var a = [1, 2, 3]; delete a[1]; '1' in a;"), false);
    },
  },

  // ---------------------------------------------------------------------------
  // delete of var-declared binding (non-configurable, non-deletable)
  // ---------------------------------------------------------------------------
  {
    name: 'delete var-declared variable returns false, binding survives',
    run() {
      assertNormal(run('var x = 42; delete x;'), false);
      assertNormal(run('var x = 42; delete x; x;'), 42);
    },
  },

  // ---------------------------------------------------------------------------
  // delete of implicit global (bare assignment without var)
  // ---------------------------------------------------------------------------
  {
    name: 'delete implicit global created by bare assignment returns true',
    run() {
      // In non-strict mode, assigning to an undeclared identifier creates a
      // configurable property on the global object — unlike var-declared
      // bindings, which are non-configurable.
      assertNormal(run('implicitGlobal = 99; delete implicitGlobal;'), true);
    },
  },
  {
    name: 'after deleting an implicit global, reading it throws ReferenceError',
    run() {
      const realm = createRealm();
      // First run: create the implicit global
      runIn(realm, 'implicitGlobal = 99;');
      // Second run: delete it, then try to read it
      const result = runIn(realm, 'delete implicitGlobal; implicitGlobal;');
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },

  // ---------------------------------------------------------------------------
  // delete non-reference expression
  // ---------------------------------------------------------------------------
  {
    name: 'delete of a non-reference expression returns true',
    run() {
      assertNormal(run('delete (1 + 1);'), true);
      assertNormal(run('delete 42;'), true);
    },
  },

  // ---------------------------------------------------------------------------
  // delete and arguments object mapping
  // ---------------------------------------------------------------------------
  {
    name: 'deleting an arguments index unmaps it from the parameter',
    run() {
      // After deleting arguments[0], the slot is gone but the parameter
      // binding lives on independently.
      assertNormal(
        run(
          'function f(a) { delete arguments[0]; a = 99; return arguments[0]; } f(1);',
        ),
        undefined,
      );
    },
  },
];

export default tests;
