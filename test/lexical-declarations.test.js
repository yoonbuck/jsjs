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
 * @param {string} constructorName
 * @param {string} message
 */
function assertThrowsMessage(source, constructorName, message) {
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
  let isInstance = false;
  while (cur !== null) {
    if (cur === proto) {
      isInstance = true;
      break;
    }
    cur = cur.getPrototype();
  }
  if (!isInstance) {
    throw new Error(`Thrown value is not an instance of ${constructorName}`);
  }
  assertSame(
    /** @type {EngineObject} */ (completion.value).get('message'),
    message,
  );
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

/**
 * @param {any} realm
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 */
function assertCompletionThrows(realm, completion, constructorName) {
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
 * @param {any} realm
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 * @param {string} message
 */
function assertCompletionThrowsMessage(
  realm,
  completion,
  constructorName,
  message,
) {
  assertCompletionThrows(realm, completion, constructorName);
  assertSame(
    /** @type {EngineObject} */ (completion.value).get('message'),
    message,
  );
}

/**
 * @param {string} source
 */
function assertParseRejects(source) {
  const realm = createRealm();
  let threw = false;
  try {
    evaluateScript(realm, source);
  } catch (error) {
    threw = error instanceof SyntaxError;
  }
  assertSame(threw, true);
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
    name: 'sloppy duplicate block functions share one binding and the last declaration wins',
    run() {
      const sources = [
        'var r; { r = f(); function f() { return 1; } function f() { return 2; } } r',
        'var r; switch (0) { case 0: r = f(); function f() { return 1; } default: function f() { return 2; } } r',
        'var r; try { r = f(); function f() { return 1; } function f() { return 2; } } finally {} r',
      ];

      for (const source of sources) {
        assertNormal(run(source), 2);
      }
    },
  },
  {
    name: 'strict duplicate block functions remain a SyntaxError',
    run() {
      assertParseRejects('"use strict"; { function f() {} function f() {} }');
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
    name: 'Annex B.3.3.1: a block function whose name collides with a formal parameter gets no var alias',
    run() {
      assertNormal(
        run(
          'function f(q){ { function q(){return 7;} } return typeof q; } f(1)',
        ),
        'number',
      );
      assertNormal(
        run('function f(q){ { function q(){return 7;} } return q; } f(1)'),
        1,
      );
    },
  },
  {
    name: 'Annex B.3.3.1: a block function named arguments still aliases as it does today',
    run() {
      assertNormal(
        run(
          'function f(){ { function arguments(){} } return typeof arguments; } f()',
        ),
        'function',
      );
    },
  },
  {
    name: 'Annex B.3.3.1: a block function whose name does not collide with a parameter still aliases',
    run() {
      assertNormal(
        run('function f(q){ { function g(){return 7;} } return g(); } f(1)'),
        7,
      );
    },
  },
  {
    name: 'Annex B.3.3.1: strict code gets no var alias when a block function collides with a parameter',
    run() {
      assertNormal(
        run(
          "function f(q){ 'use strict'; { function q(){return 7;} } return typeof q; } f(1)",
        ),
        'number',
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
  {
    name: 'a let at a sloppy function body top level is readable after its declaration',
    run() {
      assertNormal(run('function f() { let a = 5; return a; } f()'), 5);
    },
  },
  {
    name: 'a const at a sloppy function body top level is readable after its declaration',
    run() {
      assertNormal(run('function f() { const c = 42; return c; } f()'), 42);
    },
  },
  {
    name: 'a function-body let in its TDZ shadows a same-named outer binding, throwing with the TDZ message rather than reading the outer value',
    run() {
      assertThrowsMessage(
        "var a = 'outer'; function f() { a; let a = 1; return a; } f()",
        'ReferenceError',
        "Cannot access 'a' before initialization",
      );
    },
  },
  {
    name: 'a function-body let shadows a same-named outer binding without mutating it',
    run() {
      assertNormal(
        run('var x = 1; function f() { let x = 2; return x; } "" + f() + x'),
        '21',
      );
    },
  },
  {
    name: 'a parameter is visible to the function body alongside body lexicals',
    run() {
      assertNormal(run('function f(p) { let a = p + 1; return a; } f(10)'), 11);
    },
  },
  {
    name: 'a closure over a function-body const captures the body binding',
    run() {
      assertNormal(
        run(
          'function f() { const v = 7; return function () { return v; }; } f()()',
        ),
        7,
      );
    },
  },
  {
    name: 'a nested function sees the outer function body lexical bindings',
    run() {
      assertNormal(
        run(
          'function f() { let a = 3; function g() { return a; } return g(); } f()',
        ),
        3,
      );
    },
  },
  {
    name: 'arguments is still bound in a function with body lexical declarations',
    run() {
      assertNormal(
        run('function f() { let a = 1; return arguments[0] + a; } f(9)'),
        10,
      );
    },
  },
  {
    name: 'a let at a strict function body top level is readable after its declaration',
    run() {
      assertNormal(
        run("function f() { 'use strict'; let a = 5; return a; } f()"),
        5,
      );
    },
  },
  {
    name: 'a strict function-body let in its TDZ shadows a same-named outer binding, throwing with the TDZ message rather than reading the outer value',
    run() {
      assertThrowsMessage(
        "var a = 'outer'; function f() { 'use strict'; a; let a = 1; return a; } f()",
        'ReferenceError',
        "Cannot access 'a' before initialization",
      );
    },
  },
  {
    name: 'a strict parameter is visible to the function body alongside body lexicals',
    run() {
      assertNormal(
        run("function f(p) { 'use strict'; let a = p + 1; return a; } f(10)"),
        11,
      );
    },
  },
  {
    name: 'a strict function-body let shadows a same-named outer binding without mutating it',
    run() {
      assertNormal(
        run(
          'var x = 1; function f() { \'use strict\'; let x = 2; return x; } "" + f() + x',
        ),
        '21',
      );
    },
  },
  {
    name: 'a strict function-body const closure captures the body binding',
    run() {
      assertNormal(
        run(
          "function f() { 'use strict'; const v = 7; return function () { return v; }; } f()()",
        ),
        7,
      );
    },
  },
  {
    name: 'a strict nested function sees the outer strict function body lexical bindings',
    run() {
      assertNormal(
        run(
          "function f() { 'use strict'; let a = 3; function g() { return a; } return g(); } f()",
        ),
        3,
      );
    },
  },
  {
    name: 'arguments is still bound in a strict function with body lexical declarations',
    run() {
      assertNormal(
        run(
          "function f() { 'use strict'; let a = 1; return arguments[0] + a; } f(9)",
        ),
        10,
      );
    },
  },
  {
    name: 'a script-level let binding resolves to its initialized value',
    run() {
      assertNormal(run('let a = 5; a'), 5);
    },
  },
  {
    name: 'a script-level const binding resolves to its initialized value',
    run() {
      assertNormal(run('const a = 7; a'), 7);
    },
  },
  {
    name: 'reading a script-level let in its TDZ throws before initialization',
    run() {
      assertThrowsMessage(
        'a; let a = 1;',
        'ReferenceError',
        "Cannot access 'a' before initialization",
      );
    },
  },
  {
    name: 'a script-level let is invisible on the global object yet resolvable in guest code',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'let x = 1;');
      assertSame(realm.globalObject.get('x'), undefined);
      assertSame(realm.globalObject.hasProperty('x'), false);
      assertSame(evaluateScript(realm, 'this.x').value, undefined);
      assertSame(evaluateScript(realm, 'x').value, 1);
    },
  },
  {
    name: 'let undefined throws a SyntaxError because undefined is a restricted global property',
    run() {
      assertThrows('let undefined = 1;', 'SyntaxError');
    },
  },
  {
    name: 'let NaN throws a SyntaxError because NaN is a restricted global property',
    run() {
      assertThrows('let NaN = 1;', 'SyntaxError');
    },
  },
  {
    name: 'var undefined still completes normally and leaves undefined unchanged',
    run() {
      assertNormal(run('var undefined = 5;'), undefined);
      assertNormal(run('var undefined = 5; undefined'), undefined);
    },
  },
  {
    name: 'a second script in the same realm sees the first script lexical bindings',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'let a = 5; const b = 6;');
      assertNormal(evaluateScript(realm, 'a + b'), 11);
    },
  },
  {
    name: 'a second script redeclaring a lexical binding throws a SyntaxError',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'let a = 5;');
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'let a = 6;'),
        'SyntaxError',
      );
    },
  },
  {
    name: 'class declarations are mutable lexical bindings and participate in lexical conflicts',
    run() {
      const realm = createRealm();
      assertNormal(evaluateScript(realm, 'class C {}'), undefined);
      assertNormal(evaluateScript(realm, 'C = 3; C'), 3);
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'class C {}'),
        'SyntaxError',
      );
      assertParseRejects('let D; class D {}');
      assertParseRejects('class E {} var E;');
    },
  },
  {
    name: 'var after let across two scripts throws a SyntaxError',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'let x = 1;');
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'var x = 2;'),
        'SyntaxError',
      );
    },
  },
  {
    name: 'let after var across two scripts throws a SyntaxError',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 1;');
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'let x = 2;'),
        'SyntaxError',
      );
    },
  },
  {
    name: 'let x after var x within one script is rejected at parse time',
    run() {
      assertParseRejects('var x = 1; let x = 2;');
    },
  },
  {
    name: 'var x after let x within one script is rejected at parse time',
    run() {
      assertParseRejects('let x = 1; var x = 2;');
    },
  },
  {
    name: 'a failed cross-script check leaves the global environment unmodified',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'let a = 1;');
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'var b = 2; let a = 3;'),
        'SyntaxError',
      );
      assertNormal(evaluateScript(realm, 'typeof b'), 'undefined');
    },
  },
  {
    name: 'a new var on a non-extensible global throws a TypeError',
    run() {
      const realm = createRealm();
      realm.globalObject.preventExtensions();
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'var brandNewVarName;'),
        'TypeError',
      );
    },
  },
  {
    name: 'a let on a non-extensible global succeeds where a var cannot',
    run() {
      const realm = createRealm();
      realm.globalObject.preventExtensions();
      assertNormal(
        evaluateScript(realm, 'let brandNewLetName = 3;'),
        undefined,
      );
      assertNormal(evaluateScript(realm, 'brandNewLetName'), 3);
    },
  },
  {
    name: 'a var that fails its non-extensible check installs no earlier lexical binding',
    run() {
      const realm = createRealm();
      realm.globalObject.preventExtensions();
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'let leaked = 1; var blocked;'),
        'TypeError',
      );
      assertCompletionThrowsMessage(
        realm,
        evaluateScript(realm, 'leaked'),
        'ReferenceError',
        'leaked is not defined',
      );
    },
  },
  {
    name: 'a function declaration that fails its check installs no earlier lexical binding',
    run() {
      const realm = createRealm();
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'let early = 1; function undefined() {}'),
        'TypeError',
      );
      assertCompletionThrowsMessage(
        realm,
        evaluateScript(realm, 'early'),
        'ReferenceError',
        'early is not defined',
      );
    },
  },
  {
    name: 'a var check that fails after earlier declarable names installs no binding for any of them',
    run() {
      const realm = createRealm();
      realm.globalObject.preventExtensions();
      assertCompletionThrows(
        realm,
        evaluateScript(realm, 'let survivor = 1; var undefined; var blocked;'),
        'TypeError',
      );
      assertCompletionThrowsMessage(
        realm,
        evaluateScript(realm, 'survivor'),
        'ReferenceError',
        'survivor is not defined',
      );
    },
  },
];

export default tests;
