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
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 */
function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * Assert the completion is a throw completion whose value's prototype chain
 * includes the named constructor's `.prototype` in `realm`.
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
  // 15.1.2.1 step 1: a non-String argument is returned unchanged (no coercion)
  // ---------------------------------------------------------------------------
  {
    name: 'eval returns a Number argument unchanged',
    run() {
      assertNormal(run('eval(42);'), 42);
    },
  },
  {
    name: 'eval returns a Boolean argument unchanged',
    run() {
      assertNormal(run('eval(true);'), true);
    },
  },
  {
    name: 'eval returns undefined for an undefined argument',
    run() {
      assertNormal(run('eval(undefined);'), undefined);
    },
  },
  {
    name: 'eval with no arguments returns undefined',
    run() {
      assertNormal(run('eval();'), undefined);
    },
  },
  {
    name: 'eval returns an object argument by identity, without calling toString',
    run() {
      assertNormal(
        run(
          'var o = { toString: function () { return "999"; } }; eval(o) === o;',
        ),
        true,
      );
    },
  },
  {
    name: 'eval of the empty string is undefined',
    run() {
      assertNormal(run('eval("");'), undefined);
    },
  },

  // ---------------------------------------------------------------------------
  // Completion values (15.1.2.1 step 5)
  // ---------------------------------------------------------------------------
  {
    name: 'eval("1;2;") is the last statement value 2',
    run() {
      assertNormal(run('eval("1;2;");'), 2);
    },
  },
  {
    name: 'eval("var x = 5;") is undefined (empty completion)',
    run() {
      assertNormal(run('eval("var x = 5;");'), undefined);
    },
  },
  {
    name: 'eval("if (true) { 42; }") is 42',
    run() {
      assertNormal(run('eval("if (true) { 42; }");'), 42);
    },
  },
  {
    name: 'eval("for (var i = 0; i < 3; i++) i;") is 2',
    run() {
      assertNormal(run('eval("for (var i = 0; i < 3; i++) i;");'), 2);
    },
  },

  // ---------------------------------------------------------------------------
  // Parse failure -> realm-local guest SyntaxError; guest throw surfaces value
  // ---------------------------------------------------------------------------
  {
    name: 'eval("var") throws a realm-local guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(runIn(realm, 'eval("var");'), 'SyntaxError', realm);
    },
  },
  {
    name: 'eval("throw 1;") surfaces the guest throw with value 1',
    run() {
      const result = run('eval("throw 1;");');
      assertSame(result.type, 'throw');
      assertSame(result.value, 1);
    },
  },

  // ---------------------------------------------------------------------------
  // Direct eval sees and mutates the caller's scope
  // ---------------------------------------------------------------------------
  {
    name: 'direct eval reads a function-local var',
    run() {
      assertNormal(
        run('function f() { var a = 10; return eval("a"); } f();'),
        10,
      );
    },
  },
  {
    name: 'direct eval writes a function-local var',
    run() {
      assertNormal(
        run('function f() { var a = 10; eval("a = 20;"); return a; } f();'),
        20,
      );
    },
  },
  {
    name: 'direct eval var is created in the caller function scope and survives the call',
    run() {
      assertNormal(
        run('function f() { eval("var y = 41;"); return y; } f();'),
        41,
      );
    },
  },
  {
    name: 'direct eval var inside a function does not leak to the global scope',
    run() {
      assertNormal(
        run(
          'function f() { eval("var localOnly = 5;"); } f(); typeof localOnly;',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'direct eval (bareword) sees the caller-local binding, shadowing the global',
    run() {
      assertNormal(
        run(
          'var probe = 100; function f() { var probe = 1; return eval("probe"); } f();',
        ),
        1,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Direct eval hoists into the VariableEnvironment, not the LexicalEnvironment
  // (10.4.2 + 10.5): a catch clause installs a fresh lexical environment for
  // its parameter, but a `var`/function declared by a direct eval in the catch
  // body must land in the enclosing function (or global) variable environment
  // and outlive the catch scope.
  // ---------------------------------------------------------------------------
  {
    name: 'direct eval var inside a catch block hoists into the enclosing function scope',
    run() {
      assertNormal(
        run(
          'function f() { try { throw 0; } catch (e) { eval("var x = 1;"); } return typeof x; } f();',
        ),
        'number',
      );
    },
  },
  {
    name: 'direct eval function declaration inside a catch block is callable after the catch exits',
    run() {
      assertNormal(
        run(
          'function f() { try { throw 0; } catch (e) { eval("function g(){ return 7; }"); } return typeof g === "function" ? g() : "no g"; } f();',
        ),
        7,
      );
    },
  },
  {
    name: 'direct eval function declaration inside a catch block closes over the function scope, not the catch parameter',
    run() {
      // The hoisted function captures the VariableEnvironment as its [[Scope]],
      // so `e` (a catch-only lexical binding) is not visible inside it.
      assertNormal(
        run(
          'function f() { try { throw 42; } catch (e) { eval("function g(){ return typeof e; }"); } return g(); } f();',
        ),
        'undefined',
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Global declaration instantiation checks (ES5.1 10.5) for eval code
  // (configurableBindings = true) and top-level script code
  // (configurableBindings = false).
  // ---------------------------------------------------------------------------
  {
    name: 'eval("var x;") on a non-extensible global throws a guest TypeError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'Object.preventExtensions(this); eval("var x;");'),
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'top-level script var on a non-extensible global throws a guest TypeError',
    run() {
      const realm = createRealm();
      assertSame(
        runIn(realm, 'Object.preventExtensions(this);').type,
        'normal',
      );
      assertGuestThrow(runIn(realm, 'var x;'), 'TypeError', realm);
    },
  },
  {
    name: 'eval("function undefined(){}") throws a guest TypeError (non-configurable existing property)',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'eval("function undefined(){}");'),
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'top-level script function undefined(){} throws a guest TypeError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'function undefined(){}'),
        'TypeError',
        realm,
      );
    },
  },
  {
    name: 'eval("function f(){}") redefines an existing configurable, non-writable data property',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          'Object.defineProperty(this, "f", { value: 7, writable: false, enumerable: true, configurable: true }); eval("function f(){}"); typeof f;',
        ),
        'function',
      );
      const descriptor = /** @type {any} */ (
        realm.globalObject.getOwnProperty('f')
      );
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      // eval code binds with configurableBindings = true.
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'top-level script function f(){} redefines an existing configurable, non-writable data property',
    run() {
      const realm = createRealm();
      assertSame(
        runIn(
          realm,
          'Object.defineProperty(this, "f", { value: 7, writable: false, enumerable: true, configurable: true });',
        ).type,
        'normal',
      );
      assertNormal(runIn(realm, 'function f(){} typeof f;'), 'function');
      const descriptor = /** @type {any} */ (
        realm.globalObject.getOwnProperty('f')
      );
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      // Script code binds with configurableBindings = false.
      assertSame(descriptor.configurable, false);
    },
  },

  // ---------------------------------------------------------------------------
  // Indirect eval evaluates in the global environment (every indirect form)
  // ---------------------------------------------------------------------------
  {
    name: 'indirect eval via (0, eval) reads and writes the global environment',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          'var probe = 100; function f() { var probe = 1; return (0, eval)("var w = probe; w"); } f();',
        ),
        100,
      );
      assertSame(realm.globalObject.get('w'), 100);
    },
  },
  {
    name: 'indirect eval via an aliased binding (e = eval; e(...)) reads and writes the global environment',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          'var probe = 100; function f() { var probe = 1; var e = eval; return e("var w = probe; w"); } f();',
        ),
        100,
      );
      assertSame(realm.globalObject.get('w'), 100);
    },
  },
  {
    name: 'indirect eval via [eval][0](...) reads and writes the global environment',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          'var probe = 100; function f() { var probe = 1; return [eval][0]("var w = probe; w"); } f();',
        ),
        100,
      );
      assertSame(realm.globalObject.get('w'), 100);
    },
  },
  {
    name: 'indirect eval via eval.call(null, ...) reads and writes the global environment',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          'var probe = 100; function f() { var probe = 1; return eval.call(null, "var w = probe; w"); } f();',
        ),
        100,
      );
      assertSame(realm.globalObject.get('w'), 100);
    },
  },
  {
    name: 'indirect eval via obj.eval(...) reads and writes the global environment',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          'var probe = 100; function f() { var probe = 1; var o = { eval: eval }; return o.eval("var w = probe; w"); } f();',
        ),
        100,
      );
      assertSame(realm.globalObject.get('w'), 100);
    },
  },
  {
    name: 'indirect eval writes a var to the global environment',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(realm, '(0, eval)("var iGlobal = 55;"); iGlobal;'),
        55,
      );
      assertSame(realm.globalObject.get('iGlobal'), 55);
    },
  },

  // ---------------------------------------------------------------------------
  // `this` binding inside eval code (10.4.2)
  // ---------------------------------------------------------------------------
  {
    name: 'direct eval this is the caller this',
    run() {
      assertNormal(
        run(
          'var o = { m: function () { return eval("this") === o; } }; o.m();',
        ),
        true,
      );
    },
  },
  {
    name: 'indirect eval this is the global object',
    run() {
      const realm = createRealm();
      const result = runIn(realm, '(0, eval)("this");');
      assertSame(result.type, 'normal');
      assertSame(result.value, realm.globalObject);
    },
  },

  // ---------------------------------------------------------------------------
  // Strictness propagation (10.4.2 / 10.4.2.1)
  // ---------------------------------------------------------------------------
  {
    name: 'direct eval from strict code is strict without a directive: undeclared assignment throws ReferenceError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, '"use strict"; eval("undeclaredX = 1;");'),
        'ReferenceError',
        realm,
      );
    },
  },
  {
    name: 'the same source under indirect eval is non-strict and creates a global',
    run() {
      const realm = createRealm();
      assertNormal(
        runIn(
          realm,
          '"use strict"; (0, eval)("nonStrictGlobal = 5; nonStrictGlobal;");',
        ),
        5,
      );
      assertSame(realm.globalObject.get('nonStrictGlobal'), 5);
    },
  },
  {
    name: 'strict eval scoping: a strict-eval var does not leak to the caller',
    run() {
      assertNormal(
        run('"use strict"; eval("var z = 1;"); typeof z;'),
        'undefined',
      );
    },
  },
  {
    name: 'non-strict eval scoping: the same source leaks the var to the caller',
    run() {
      assertNormal(run('eval("var z = 1;"); typeof z;'), 'number');
      assertNormal(run('eval("var zz = 41;"); zz;'), 41);
    },
  },

  // ---------------------------------------------------------------------------
  // Forced strict early errors (direct eval from strict code)
  // ---------------------------------------------------------------------------
  {
    name: 'forced-strict eval rejects "var eval = 1" with a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, '"use strict"; eval("var eval = 1;");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'forced-strict eval rejects "with (x) {}" with a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, '"use strict"; eval("with (x) {}");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'forced-strict eval rejects a legacy octal literal with a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, '"use strict"; eval("var x = 010;");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a legacy octal literal is accepted under non-strict (indirect) eval',
    run() {
      assertNormal(run('(0, eval)("010;");'), 8);
    },
  },

  // ---------------------------------------------------------------------------
  // Deletability: eval-created bindings are configurable (10.5, configurable=true)
  // ---------------------------------------------------------------------------
  {
    name: 'eval("var q = 1"); delete q is true and removes the binding',
    run() {
      assertNormal(run('eval("var q = 1;"); delete q;'), true);
      assertNormal(run('eval("var q = 1;"); delete q; typeof q;'), 'undefined');
    },
  },
  {
    name: 'a top-level script var is not deletable',
    run() {
      assertNormal(run('var q2 = 1; delete q2;'), false);
    },
  },

  // ---------------------------------------------------------------------------
  // Global `eval` property + function descriptor
  // ---------------------------------------------------------------------------
  {
    name: 'the global eval property is writable, non-enumerable, configurable',
    run() {
      const realm = createRealm();
      const descriptor = /** @type {any} */ (
        realm.globalObject.getOwnProperty('eval')
      );
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, true);
      assertSame(descriptor.value, realm.intrinsics.evalFunction);
    },
  },
  {
    name: 'the eval function has length 1, name "eval", and no prototype property',
    run() {
      const realm = createRealm();
      const evalFunction = /** @type {EngineObject} */ (
        realm.intrinsics.evalFunction
      );
      assertSame(evalFunction.get('length'), 1);
      assertSame(evalFunction.get('name'), 'eval');
      assertSame(evalFunction.getOwnProperty('prototype'), undefined);
    },
  },
  {
    name: 'new eval("1") throws a TypeError (eval is not a constructor)',
    run() {
      const realm = createRealm();
      assertGuestThrow(runIn(realm, 'new eval("1");'), 'TypeError', realm);
    },
  },

  // ---------------------------------------------------------------------------
  // Realm isolation: realm A's eval always evaluates against realm A, even when
  // it is installed under realm B's own `eval` binding. This specifically
  // guards the realm-identity half of the direct-eval predicate: name === 'eval'
  // and an environment-record reference are both satisfied here, so only the
  // `callee === thisRealm.evalFunction` check keeps it indirect.
  // ---------------------------------------------------------------------------
  {
    name: "realm A eval bound to realm B's own eval identifier is still indirect and allocates in realm A",
    run() {
      const realmA = createRealm();
      const realmB = createRealm();

      // Overwrite realm B's *exact* `eval` binding with realm A's eval
      // function, so the call is `eval(...)` against an environment-record
      // reference named 'eval' — a direct-eval shape in every respect except
      // realm identity.
      realmB.globalObject.defineOwnProperty('eval', {
        value: realmA.intrinsics.evalFunction,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const result = runIn(realmB, 'eval("var madeInA = ({}); madeInA;");');
      assertSame(result.type, 'normal');

      // Indirect eval runs in realm A, so the object literal inherits realm A's
      // Object.prototype. If the realm-identity predicate were deleted this
      // would be treated as a direct eval running in realm B and the prototype
      // would be realm B's — this assertion is what fails in that case.
      if (!(result.value instanceof EngineObject)) {
        throw new Error('Expected an EngineObject eval result');
      }
      const proto = /** @type {EngineObject} */ (result.value).getPrototype();
      assertSame(proto, realmA.intrinsics.objectPrototype);
      assertSame(proto === realmB.intrinsics.objectPrototype, false);

      // The `var` binding was created in realm A's global environment, never
      // realm B's.
      assertSame(realmA.globalObject.get('madeInA'), result.value);
      assertSame(realmB.globalObject.getOwnProperty('madeInA'), undefined);
    },
  },
];

export default tests;
