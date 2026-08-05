import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const realm = createRealm();
  return evaluateScript(realm, source).value;
}

const tests = [
  {
    name: 'function declarations create callable bindings and calls evaluate to the returned value',
    run() {
      assertSame(run('function add(a, b) { return a + b; } add(2, 3);'), 5);
    },
  },
  {
    name: 'function declarations are hoisted above their statement position',
    run() {
      assertSame(run('var r = f(); function f() { return 7; } r;'), 7);
    },
  },
  {
    name: 'block-nested function declarations hoist eagerly, deviating from Annex B',
    run() {
      assertSame(run('var r = f(); { function f() { return 1; } } r;'), 1);
      assertSame(
        run('var r = f(); while (false) { function f() { return 2; } } r;'),
        2,
      );

      // Annex B leaves the binding `undefined` until the declaration is
      // evaluated, so a real engine reports 'undefined' for both of these.
      // The current engine binds the function during declaration
      // instantiation regardless of whether the block ever runs; this
      // pins that known deviation rather than endorsing it.
      assertSame(
        run('if (false) { function f() { return 1; } } typeof f;'),
        'function',
      );
      assertSame(
        run(
          'function g() { if (false) { function h() { return 2; } } return typeof h; } g();',
        ),
        'function',
      );
    },
  },
  {
    name: 'a function body without a return statement completes with undefined',
    run() {
      assertSame(run('function f() { 1; } f();'), undefined);
      assertSame(run('function f() { return; } f();'), undefined);
    },
  },
  {
    name: 'return exits the function immediately, including from inside a loop',
    run() {
      assertSame(
        run(
          'function f() { for (var i = 0; i < 10; i = i + 1) { if (i === 3) { return i; } } return -1; } f();',
        ),
        3,
      );
      assertSame(run('function f() { return 1; f(); return 2; } f();'), 1);
    },
  },
  {
    name: 'missing arguments bind undefined and extra arguments are ignored',
    run() {
      assertSame(
        run('function f(a, b) { return typeof b; } f(1);'),
        'undefined',
      );
      assertSame(run('function f(a) { return a; } f(1, 2);'), 1);
      assertSame(run('function f() { return 1; } f(2, 3);'), 1);
    },
  },
  {
    name: 'closures capture the lexical environment where the function was created',
    run() {
      assertSame(
        run(
          'function makeCounter() { var count = 0; function increment() { count = count + 1; return count; } return increment; } ' +
            'var counter = makeCounter(); counter(); counter(); counter();',
        ),
        3,
      );
    },
  },
  {
    name: 'two closures over separate calls capture independent environments',
    run() {
      assertSame(
        run(
          'function makeCounter() { var count = 0; function increment() { count = count + 1; return count; } return increment; } ' +
            'var a = makeCounter(); var b = makeCounter(); a(); a(); b();',
        ),
        1,
      );
    },
  },
  {
    name: 'a closure reads later mutations of a captured binding',
    run() {
      assertSame(
        run(
          'function outer() { var value = 1; function read() { return value; } value = 2; return read(); } outer();',
        ),
        2,
      );
    },
  },
  {
    name: 'recursion resolves the function through its own binding',
    run() {
      assertSame(
        run(
          'function fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); } fact(5);',
        ),
        120,
      );
      assertSame(
        run(
          'function fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); } fib(10);',
        ),
        55,
      );
    },
  },
  {
    name: 'function-body var declarations are function scoped and never reach the global object',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'function f() { var inner = 1; return inner; } var result = f();',
      );

      assertSame(realm.globalObject.get('result'), 1);
      assertSame(realm.globalObject.getOwnProperty('inner'), undefined);
      assertSame(evaluateScript(realm, 'typeof inner;').value, 'undefined');
    },
  },
  {
    name: 'function-body var declarations are hoisted within the activation environment',
    run() {
      assertSame(
        run(
          'function f() { var seen = typeof x; var x = 1; return seen; } f();',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'parameters shadow outer bindings and assignment stays local to the activation',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var x = "outer"; function f(x) { x = "inner"; return x; } var inner = f("argument");',
      );

      assertSame(realm.globalObject.get('inner'), 'inner');
      assertSame(realm.globalObject.get('x'), 'outer');
    },
  },
  {
    name: 'nested function declarations are hoisted inside their enclosing function body',
    run() {
      assertSame(
        run('function f() { return g(); function g() { return 9; } } f();'),
        9,
      );
    },
  },
  {
    name: 'function expressions produce callable values and can be called immediately',
    run() {
      assertSame(run('var f = function (a) { return a * 2; }; f(4);'), 8);
      assertSame(run('(function (a) { return a + 1; })(1);'), 2);
    },
  },
  {
    name: 'a named function expression binds its own name inside its body only',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var fact = function self(n) { if (n <= 1) { return 1; } return n * self(n - 1); }; var result = fact(4);',
      );

      assertSame(realm.globalObject.get('result'), 24);
      assertSame(evaluateScript(realm, 'typeof self;').value, 'undefined');
    },
  },
  {
    name: 'typeof a function value is "function"',
    run() {
      assertSame(run('function f() {} typeof f;'), 'function');
      assertSame(run('typeof function () {};'), 'function');
    },
  },
  {
    name: 'functions expose a non-writable length equal to their formal parameter count',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'function f(a, b, c) {}');

      const f = /** @type {any} */ (realm.globalObject.get('f'));
      const descriptor = f.getOwnProperty('length');
      assertSame(descriptor.value, 3);
      assertSame(descriptor.writable, false);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, false);
      assertSame(run('function g() {} g.length;'), 0);
    },
  },
  {
    name: 'functions expose a prototype object whose constructor points back at the function',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'function f() {}');

      const f = /** @type {any} */ (realm.globalObject.get('f'));
      const descriptor = f.getOwnProperty('prototype');
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, false);
      assertSame(/** @type {any} */ (descriptor.value).get('constructor'), f);
      assertSame(run('function f() {} f.prototype.constructor === f;'), true);
    },
  },
  {
    name: 'functions inherit from the realm intrinsic function prototype',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'function f() {}');

      const f = /** @type {any} */ (realm.globalObject.get('f'));
      assertSame(f.getPrototype(), realm.intrinsics.functionPrototype);
    },
  },
  {
    name: 'arguments exposes the actual argument count and values',
    run() {
      assertSame(
        run('function f() { return arguments.length; } f(1, 2, 3);'),
        3,
      );
      assertSame(run('function f(a) { return arguments.length; } f();'), 0);
      assertSame(
        run('function f() { return arguments[1]; } f("a", "b");'),
        'b',
      );
      assertSame(
        run('function f() { return typeof arguments[5]; } f("a");'),
        'undefined',
      );
    },
  },
  {
    name: 'arguments.callee is the running function',
    run() {
      assertSame(
        run('function f() { return arguments.callee === f; } f();'),
        true,
      );
      assertSame(
        run(
          'var fact = function (n) { if (n <= 1) { return 1; } return n * arguments.callee(n - 1); }; fact(5);',
        ),
        120,
      );
    },
  },
  {
    name: 'non-strict arguments indices stay mapped to their formal parameters',
    run() {
      assertSame(run('function f(a) { a = 2; return arguments[0]; } f(1);'), 2);
      assertSame(run('function f(a) { arguments[0] = 2; return a; } f(1);'), 2);
      assertSame(
        run(
          'function f(a, b) { b = 5; return arguments[1] + arguments[0]; } f(1, 2);',
        ),
        6,
      );
    },
  },
  {
    name: 'arguments indices beyond the formal parameters are unmapped values',
    run() {
      assertSame(
        run(
          'function f(a) { arguments[1] = 9; return arguments[1]; } f(1, 2);',
        ),
        9,
      );
      assertSame(
        run(
          'function f(a) { arguments[0] = 9; return arguments.length; } f(1, 2, 3);',
        ),
        3,
      );
    },
  },
  {
    name: 'a declared binding named arguments replaces the arguments object',
    run() {
      assertSame(run('function f(arguments) { return arguments; } f(7);'), 7);
      assertSame(
        run('function f() { var arguments = 3; return arguments; } f(1, 2);'),
        3,
      );
    },
  },
  {
    name: 'each call gets a fresh arguments object',
    run() {
      assertSame(
        run(
          'function f(a) { if (a === 1) { return f(2); } return arguments[0]; } f(1);',
        ),
        2,
      );
    },
  },
  {
    name: 'this at the top level of a script is the global object',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, 'this;').value, realm.globalObject);
    },
  },
  {
    name: 'this in a plain function call is the global object in non-strict code',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'function f() { return this; } var t = f();');

      assertSame(realm.globalObject.get('t'), realm.globalObject);
      assertSame(
        evaluateScript(realm, 'function g() { return this === this; } g();')
          .value,
        true,
      );
    },
  },
  {
    name: 'a member call binds the receiver object as this',
    run() {
      assertSame(
        run('var o = {v: 4, m: function () { return this.v; }}; o.m();'),
        4,
      );
      assertSame(
        run('var o = {v: 4, m: function () { return this.v; }}; o["m"]();'),
        4,
      );
      assertSame(
        run(
          'var o = {inner: {v: 5, m: function () { return this.v; }}}; o.inner.m();',
        ),
        5,
      );
    },
  },
  {
    name: 'a method detached from its object falls back to the global this',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var o = {m: function () { return this; }}; var detached = o.m; var t = detached();',
      );

      assertSame(realm.globalObject.get('t'), realm.globalObject);
    },
  },
  {
    name: 'a plain call inside a method does not inherit the method receiver',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var o = {m: function () { function inner() { return this; } return inner(); }}; var t = o.m();',
      );

      assertSame(realm.globalObject.get('t'), realm.globalObject);
    },
  },
  {
    name: 'a member call evaluates its receiver expression exactly once',
    run() {
      assertSame(
        run(
          'var calls = 0; var o = {m: function () { return 1; }}; ' +
            'function receiver() { calls = calls + 1; return o; } receiver().m(); calls;',
        ),
        1,
      );
    },
  },
  {
    name: 'call arguments are evaluated left to right',
    run() {
      assertSame(
        run(
          'var order = ""; function note(value) { order = order + value; return value; } ' +
            'function f(a, b, c) { return order; } f(note("a"), note("b"), note("c"));',
        ),
        'abc',
      );
    },
  },
  {
    name: 'arguments are evaluated before the callee is rejected as non-callable',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var order = ""; var notCallable = 1;');

      const result = evaluateScript(
        realm,
        'notCallable((order = order + "a"));',
      );
      assertSame(result.type, 'throw');
      assertSame(realm.globalObject.get('order'), 'a');
    },
  },
  {
    name: 'a primitive this value is boxed for a non-strict call',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'function f() { return this; }');

      const f = /** @type {any} */ (realm.globalObject.get('f'));
      const result = f.callFunction(5, []);
      assertSame(result instanceof EngineObject, true);
      assertSame(result.getClassName(), 'Number');
      assertSame(result.primitiveValue, 5);
    },
  },
  {
    name: 'new creates an instance whose this receives the constructor assignments',
    run() {
      assertSame(
        run('function P(v) { this.v = v; } var p = new P(3); p.v;'),
        3,
      );
      assertSame(run('function P() { this.v = 1; } var p = new P; p.v;'), 1);
      assertSame(
        run('function P(a, b) { this.sum = a + b; } new P(1, 2).sum;'),
        3,
      );
    },
  },
  {
    name: 'instances inherit from the constructor prototype object',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'function P() {} var p = new P();');

      const constructor = /** @type {any} */ (realm.globalObject.get('P'));
      const instance = /** @type {any} */ (realm.globalObject.get('p'));

      assertSame(instance.getPrototype(), constructor.get('prototype'));
      assertSame(evaluateScript(realm, 'p.constructor === P;').value, true);
    },
  },
  {
    name: 'prototype methods are shared by instances and receive the instance as this',
    run() {
      assertSame(
        run(
          'function P(v) { this.v = v; } P.prototype.get = function () { return this.v; }; ' +
            'var a = new P(1); var b = new P(2); a.get() + b.get();',
        ),
        3,
      );
    },
  },
  {
    name: 'prototype mutations are visible to already-created instances',
    run() {
      assertSame(
        run('function P() {} var p = new P(); P.prototype.late = 5; p.late;'),
        5,
      );
    },
  },
  {
    name: 'assigning to an inherited property creates an own property on the instance',
    run() {
      assertSame(
        run(
          'function P() {} P.prototype.v = 1; var p = new P(); p.v = 2; P.prototype.v;',
        ),
        1,
      );
      assertSame(
        run(
          'function P() {} P.prototype.v = 1; var p = new P(); p.v = 2; p.v;',
        ),
        2,
      );
    },
  },
  {
    name: 'a constructor returning an object replaces the new instance',
    run() {
      assertSame(
        run(
          'function P() { this.a = 1; return {b: 2}; } var p = new P(); p.b;',
        ),
        2,
      );
      assertSame(
        run(
          'function P() { this.a = 1; return {b: 2}; } var p = new P(); typeof p.a;',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'a constructor returning a primitive keeps the new instance',
    run() {
      assertSame(run('function P() { this.a = 1; return 5; } new P().a;'), 1);
      assertSame(run('function P() { this.a = 1; return; } new P().a;'), 1);
    },
  },
  {
    name: 'a constructor with a non-object prototype property falls back to the object prototype',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'function P() {} P.prototype = 1; var p = new P();',
      );

      const instance = /** @type {any} */ (realm.globalObject.get('p'));
      assertSame(instance.getPrototype(), realm.intrinsics.objectPrototype);
    },
  },
  {
    name: 'new on a value that is not a constructor produces a guest TypeError',
    run() {
      const r1 = evaluateScript(createRealm(), 'var x = 1; new x();');
      assertSame(r1.type, 'throw');
      const r2 = evaluateScript(createRealm(), 'var o = {}; new o.missing();');
      assertSame(r2.type, 'throw');
    },
  },
  {
    name: 'a top-level throw produces a throw completion and stops the script',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var reached = "no"; throw 1; reached = "yes";',
      );

      assertSame(completion.type, 'throw');
      assertSame(completion.value, 1);
      assertSame(realm.globalObject.get('reached'), 'no');
    },
  },
  {
    name: 'a throw inside a function propagates out of the call',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var order = ""; function f() { order = order + "a"; throw "boom"; order = order + "b"; } f();',
      );

      assertSame(completion.type, 'throw');
      assertSame(completion.value, 'boom');
      assertSame(realm.globalObject.get('order'), 'a');
    },
  },
  {
    name: 'a throw propagates through nested calls and loops',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'function inner() { throw 2; } ' +
          'function outer() { for (var i = 0; i < 3; i = i + 1) { inner(); } return "unreachable"; } ' +
          'var result = outer(); result = "assigned";',
      );

      assertSame(completion.type, 'throw');
      assertSame(completion.value, 2);
      assertSame(realm.globalObject.get('result'), undefined);
    },
  },
  {
    name: 'a thrown object value is carried by the throw completion',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, 'throw {code: 5};');

      assertSame(completion.type, 'throw');
      assertSame(/** @type {any} */ (completion.value).get('code'), 5);
    },
  },
  {
    name: 'a throw propagates out of constructors and accessors',
    run() {
      const realm = createRealm();
      const constructed = evaluateScript(
        realm,
        'function P() { throw "in constructor"; } new P();',
      );
      assertSame(constructed.type, 'throw');
      assertSame(constructed.value, 'in constructor');

      const read = evaluateScript(
        createRealm(),
        'var o = {get a() { throw "in getter"; }}; o.a;',
      );
      assertSame(read.type, 'throw');
      assertSame(read.value, 'in getter');
    },
  },
  {
    name: 'a function that returns normally after a caller-visible throw is unaffected',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'function f(shouldThrow) { if (shouldThrow) { throw 1; } return "ok"; } var first = f(false);',
      );

      assertSame(completion.type, 'normal');
      assertSame(realm.globalObject.get('first'), 'ok');
    },
  },
  {
    name: 'sequence expressions evaluate left to right and produce the last value',
    run() {
      assertSame(run('(1, 2);'), 2);
      assertSame(
        run(
          'var order = ""; function note(v) { order = order + v; return v; } var last = (note("a"), note("b")); order + last;',
        ),
        'abb',
      );
    },
  },
  {
    name: 'calling a value that is not callable produces a guest TypeError',
    run() {
      const r1 = evaluateScript(createRealm(), 'var x = 1; x();');
      assertSame(r1.type, 'throw');
      const r2 = evaluateScript(createRealm(), 'var x; x();');
      assertSame(r2.type, 'throw');
    },
  },
];

export default tests;
