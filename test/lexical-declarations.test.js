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

/**
 * @param {string} source
 * @param {string} name
 * @returns {unknown}
 */
function globalHasBindingAfter(source, name) {
  const realm = createRealm();
  try {
    evaluateScript(realm, source);
  } catch {
    void 0;
  }
  return evaluateScript(realm, `'${name}' in this`).value;
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
    name: 'a switch earlier case reading a binding declared in a later case throws in its TDZ',
    run() {
      assertThrows(
        'switch (1) { case 1: a; case 2: let a = 1; }',
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
  {
    name: 'Annex B.3.3: only the eligible same-named block function aliases into the var scope',
    run() {
      assertNormal(
        run(
          '{ function f() { return 1; } } { let f; { function f() { return 2; } } } f()',
        ),
        1,
      );
    },
  },
  {
    name: 'Annex B.3.3: a dead for-head let blocks the var alias for a same-named block function',
    run() {
      assertSame(
        globalHasBindingAfter(
          'for (let f = 0; false; ) { function f() {} }',
          'f',
        ),
        false,
      );
    },
  },
  {
    name: 'a for let head gives each iteration its own binding while a var head shares one',
    run() {
      assertNormal(
        run(
          'var fns = []; for (let i = 0; i < 3; i++) { fns.push(function () { return i; }); } "" + fns[0]() + fns[1]() + fns[2]()',
        ),
        '012',
      );
      assertNormal(
        run(
          'var fns = []; for (var i = 0; i < 3; i++) { fns.push(function () { return i; }); } "" + fns[0]() + fns[1]() + fns[2]()',
        ),
        '333',
      );
    },
  },
  {
    name: 'a for const head is readable, terminates the loop, and rejects an assigning update with a TypeError',
    run() {
      assertNormal(
        run(
          'var sum = 0; var n = 0; for (const c = 10; n < 3; n = n + 1) { sum = sum + c; } sum',
        ),
        30,
      );
      assertThrows('for (const i = 0; i < 3; i++) { }', 'TypeError');
    },
  },
  {
    name: 'continue carries the per-iteration for let binding forward into each closure',
    run() {
      assertNormal(
        run(
          'var fns = []; for (let i = 0; i < 4; i++) { if (i === 1) { continue; } fns.push(function () { return i; }); } "" + fns.length + fns[0]() + fns[1]() + fns[2]()',
        ),
        '3023',
      );
    },
  },
  {
    name: 'a labelled break escapes a for let loop with the accumulated value',
    run() {
      assertNormal(
        run(
          'var r = -1; outer: for (let i = 0; i < 5; i++) { if (i === 2) { break outer; } r = i; } r',
        ),
        1,
      );
    },
  },
  {
    name: 'a for-in let head reads its own binding in the TDZ when evaluating the right expression',
    run() {
      assertThrows('var x = { a: 1 }; for (let x in x) { }', 'ReferenceError');
    },
  },
  {
    name: 'a for-in const head binds freshly per iteration so each closure captures its own key',
    run() {
      assertNormal(
        run(
          'var o = { a: 1, b: 2, c: 3 }; var fns = []; for (const k in o) { fns.push(function () { return k; }); } "" + fns[0]() + fns[1]() + fns[2]()',
        ),
        'abc',
      );
    },
  },
  {
    name: 'a var declared in a for let body hoists past the loop environment to the enclosing variable scope',
    run() {
      assertNormal(
        run(
          'var total = 0; for (let i = 0; i < 3; i++) { var seen = i; total = total + seen; } "" + total + seen',
        ),
        '32',
      );
    },
  },
  {
    name: 'a for let head shadows an outer binding of the same name without mutating it',
    run() {
      assertNormal(
        run(
          'var i = 99; var captured; for (let i = 0; i < 1; i++) { captured = i; } "" + captured + i',
        ),
        '099',
      );
    },
  },
];

export default tests;
