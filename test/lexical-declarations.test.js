import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * @param {string} source
 * @returns {{ type: string, value: unknown }}
 */
function run(source) {
  return evaluateScript(createRealm(), source);
}

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 */
function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * @param {string} source
 * @param {string} constructorName
 */
function assertThrows(source, constructorName) {
  const realm = createRealm();
  const completion = evaluateScript(realm, source);
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

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'a block-scoped let is the block completion value',
    run() {
      assertNormal(run('{ let a = 5; a }'), 5);
    },
  },
  {
    name: 'a block-scoped let does not leak to the enclosing scope',
    run() {
      assertNormal(run('var x = 1; { let x = 2; } x'), 1);
    },
  },
  {
    name: 'a nested block let shadows an outer block let',
    run() {
      assertNormal(run('{ let x = 1; let r; { let x = 2; r = x; } r }'), 2);
      assertNormal(run('{ let x = 1; { let x = 2; } x }'), 1);
    },
  },
  {
    name: 'reading a lexical binding in its TDZ throws a ReferenceError',
    run() {
      assertThrows('{ x; let x = 1; }', 'ReferenceError');
    },
  },
  {
    name: 'writing a lexical binding in its TDZ throws a ReferenceError',
    run() {
      assertThrows('{ x = 2; let x = 1; }', 'ReferenceError');
    },
  },
  {
    name: 'typeof on a lexical binding in its TDZ throws, unlike an undeclared name',
    run() {
      assertThrows('{ typeof x; let x = 1; }', 'ReferenceError');
      assertNormal(run('typeof undeclaredNameXYZ'), 'undefined');
    },
  },
  {
    name: 'assigning to a const throws a TypeError in sloppy code',
    run() {
      assertThrows('{ const c = 1; c = 2; }', 'TypeError');
    },
  },
  {
    name: 'assigning to a const throws a TypeError in strict code',
    run() {
      assertThrows("'use strict'; { const c = 1; c = 2; }", 'TypeError');
    },
  },
  {
    name: 'a const read without reassignment yields its value',
    run() {
      assertNormal(run('{ const c = 42; c }'), 42);
    },
  },
  {
    name: 'a let declared with no initializer is undefined',
    run() {
      assertNormal(run('{ let a; a }'), undefined);
    },
  },
  {
    name: 'a closure created in a block captures the block binding',
    run() {
      assertNormal(
        run('var get; { let v = 10; get = function () { return v; }; } get()'),
        10,
      );
    },
  },
  {
    name: 'a switch case block is one lexical scope shared across cases',
    run() {
      assertNormal(run('switch (1) { case 1: let a = 7; case 2: a; }'), 7);
    },
  },
  {
    name: 'a switch case block TDZ read from a later case throws',
    run() {
      assertThrows(
        'switch (2) { case 1: let a = 1; case 2: a; }',
        'ReferenceError',
      );
    },
  },
  {
    name: 'a switch discriminant is evaluated in the outer environment',
    run() {
      assertNormal(
        run('var d = 2; switch (d) { case 1: let d = 9; case 2: 5; }'),
        5,
      );
    },
  },
  {
    name: 'try, catch, and finally each scope a let separately',
    run() {
      assertNormal(
        run(
          'var out = 0; try { let a = 1; throw a; } catch (e) { let a = e + 10; out = a; } finally { let a = 100; out = out + a; } out',
        ),
        111,
      );
    },
  },
  {
    name: 'a catch parameter still shadows an outer binding and does not leak',
    run() {
      assertNormal(run('var e = 9; try { throw 3; } catch (e) {} e'), 9);
      assertNormal(run('var r; try { throw 5; } catch (e) { r = e; } r'), 5);
    },
  },
  {
    name: 'a block-level function declaration is hoisted within its block',
    run() {
      assertNormal(run('{ let r = f(); function f() { return 7; } r }'), 7);
      assertNormal(run('{ let t = typeof f; function f() {} t }'), 'function');
    },
  },
  {
    name: 'Annex B.3.3: a sloppy block function aliases into the enclosing var scope',
    run() {
      assertNormal(run('{ function f() { return 42; } } typeof f'), 'function');
      assertNormal(run('{ function f() { return 42; } } f()'), 42);
    },
  },
  {
    name: 'Annex B.3.3: a sloppy block function in a dead branch aliases to undefined',
    run() {
      assertNormal(run('if (false) { function f() {} } typeof f'), 'undefined');
    },
  },
  {
    name: 'Annex B.3.3: strict code gets no var alias for a block function',
    run() {
      assertNormal(
        run("'use strict'; { function f() {} } typeof f"),
        'undefined',
      );
    },
  },
];

export default tests;
