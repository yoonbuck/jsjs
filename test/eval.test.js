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
    /** @type {EngineObject} */ (completion.value).getPrototypeOf()
  );

  while (cur !== null) {
    if (cur === proto) return;
    cur = cur.getPrototypeOf();
  }

  throw new Error(`Thrown value is not an instance of ${constructorName}`);
}

/**
 * Assert the completion is a guest throw of `constructorName` in `realm` whose
 * `message` own property is exactly `message`. Used for TDZ reads, whose
 * `ReferenceError` must be told apart from an unresolved-identifier
 * `ReferenceError` by its message.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 * @param {string} message
 * @param {import('../src/runtime/realm.js').Realm} realm
 */
function assertGuestThrowMessage(completion, constructorName, message, realm) {
  assertGuestThrow(completion, constructorName, realm);
  assertSame(
    /** @type {EngineObject} */ (completion.value).get('message'),
    message,
  );
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
    name: 'eval of a function declaration in with-body throws a guest SyntaxError',
    run() {
      // The early-error pass runs for `parseEval` too, so a `FunctionDeclaration`
      // wedged into a `with` body reaches guest code as a catchable, realm-local
      // SyntaxError rather than a host throw or a silently accepted program.
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'eval("with ({}) function f() {}");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'eval hoists duplicate sloppy block functions with the last declaration winning',
    run() {
      assertNormal(
        run(
          'eval("{ function f() { return 1; } function f() { return 2; } } f()");',
        ),
        2,
      );
    },
  },
  {
    name: 'eval rejects duplicate strict block functions with a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(
          realm,
          'eval("\\"use strict\\"; { function f() {} function f() {} }");',
        ),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'eval rejects a direct if-body function in sloppy and strict code',
    run() {
      for (const source of [
        'eval("if (true) function f() {}");',
        '"use strict"; eval("if (true) function f() {}");',
      ]) {
        const realm = createRealm();
        assertGuestThrow(runIn(realm, source), 'SyntaxError', realm);
      }
    },
  },
  {
    name: 'eval of deeply nested but valid source does not leak a host RangeError',
    run() {
      // A host RangeError from a runaway AST walk would escape the guest
      // boundary entirely — not a guest throw completion, but a host crash
      // through `evaluateScript`. Deep-but-valid source must simply run.
      const chain = '.a'.repeat(20000);
      const result = run(`eval("if (false) { a${chain}; } 7;");`);

      assertSame(result.type, 'normal');
      assertSame(result.value, 7);
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
  {
    name: 'direct eval retains super property and call access in object methods',
    run() {
      assertNormal(
        run(
          'var base = { value: 40, m: function () { return this.offset + 1; } };' +
            'var object = { __proto__: base, offset: 1, method() {' +
            '  return eval("super.value + super.m()");' +
            '} }; object.method();',
        ),
        42,
      );
    },
  },
  {
    name: 'direct eval retains super property and call access in class methods and lexical arrows',
    run() {
      assertNormal(
        run(
          'class Base { m() { return this.value + 1; } }' +
            'class Derived extends Base {' +
            '  constructor() { super(); this.value = 41; }' +
            '  m() { return (() => eval("super.m()"))(); }' +
            '} new Derived().m();',
        ),
        42,
      );
    },
  },
  {
    name: 'direct eval can call super in a derived constructor',
    run() {
      assertNormal(
        run(
          'class Base { constructor(value) { this.value = value; } }' +
            'class Derived extends Base {' +
            '  constructor() { eval("super(42)"); }' +
            '} new Derived().value;',
        ),
        42,
      );
    },
  },
  {
    name: 'direct eval can call super through a lexical arrow in a derived constructor',
    run() {
      assertNormal(
        run(
          'class Base { constructor(value) { this.value = value; } }' +
            'class Derived extends Base {' +
            '  constructor() { (() => eval("super(42)"))(); }' +
            '} new Derived().value;',
        ),
        42,
      );
    },
  },
  {
    name: 'direct eval rejects super calls in base constructors with a realm-local SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(
          realm,
          'class Base { constructor() { eval("super()"); } } new Base();',
        ),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'direct eval rejects super properties in non-method functions with a realm-local SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(
          realm,
          'function ordinary() { eval("super.value"); } ordinary();',
        ),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'indirect eval does not retain a method super context',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(
          realm,
          'var object = { method() { return (0, eval)("super.value"); } }; object.method();',
        ),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'indirect eval does not retain a derived constructor super context',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(
          realm,
          'class Base {} class Derived extends Base {' +
            '  constructor() { (0, eval)("super()"); }' +
            '} new Derived();',
        ),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'direct eval in a parameter initializer and strict eval inherit new.target',
    run() {
      assertNormal(
        run(`
          function F(a = eval('new.target')) {
            return [a, eval('"use strict"; new.target')];
          }
          var called = F();
          var constructed = new F();
          [
            called[0] === undefined,
            called[1] === undefined,
            constructed[0] === F,
            constructed[1] === F
          ].join(':');
        `),
        'true:true:true:true',
      );
    },
  },
  {
    name: 'direct eval inside a lexical arrow inherits the enclosing ordinary invocation new.target',
    run() {
      assertNormal(
        run(`
          function F() {
            this.observed = (() => eval("new.target"))();
          }
          var called = F();
          var constructed = new F();
          [
            called === undefined,
            this.observed === undefined,
            constructed.observed === F
          ].join(':');
        `),
        'true:true:true',
      );
    },
  },
  {
    name: 'direct eval inside a top-level lexical arrow rejects new.target with a realm-local SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, '(() => eval("new.target"))();'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'indirect eval rejects new.target with a realm-local SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, '(0, eval)("new.target");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'strict eval keeps a fresh lexical environment while retaining the caller function record',
    run() {
      assertNormal(
        run(`
          function F() {
            var evalValue = eval(
              '"use strict"; var strictVar = new.target; ' +
              'let strictLex = strictVar; strictLex === F;'
            );
            this.result = evalValue + ':' + typeof strictVar;
          }
          new F().result;
        `),
        'true:undefined',
      );
    },
  },
  {
    name: 'direct eval parse failures use the direct caller Realm SyntaxError',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const foreign = runIn(
        realmA,
        '(function foreignEvalParseFailure() { return eval("}"); })',
      ).value;

      realmB.globalObject.defineOwnProperty('foreignEvalParseFailure', {
        value: foreign,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const completion = runIn(realmB, 'foreignEvalParseFailure();');
      assertGuestThrow(completion, 'SyntaxError', realmA);
      assertSame(
        /** @type {EngineObject} */ (completion.value).getPrototype() ===
          realmB.intrinsics.syntaxErrorPrototype,
        false,
      );
    },
  },

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
    name: 'a direct-eval hoisted function captures the eval lexical environment, so a catch-nested one sees the catch parameter',
    run() {
      assertNormal(
        run(
          'function f() { try { throw 42; } catch (e) { eval("function g(){ return typeof e; }"); } return g(); } f();',
        ),
        'number',
      );
    },
  },
  {
    name: 'a direct-eval hoisted function sees a let declared in the same eval',
    run() {
      assertNormal(
        run(
          'function o() { eval("let x = 41; function f(){ return x + 1; }"); return f(); } o();',
        ),
        42,
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
      const proto = /** @type {EngineObject} */ (result.value).getPrototypeOf();
      assertSame(proto, realmA.intrinsics.objectPrototype);
      assertSame(proto === realmB.intrinsics.objectPrototype, false);

      // The `var` binding was created in realm A's global environment, never
      // realm B's.
      assertSame(realmA.globalObject.get('madeInA'), result.value);
      assertSame(realmB.globalObject.getOwnProperty('madeInA'), undefined);
    },
  },

  {
    name: 'eval("let x = 1;") does not leak x to the caller (fresh lexical environment)',
    run() {
      assertNormal(run('eval("let x = 1;"); typeof x;'), 'undefined');
    },
  },
  {
    name: 'eval("const x = 1;") does not leak x to the caller',
    run() {
      assertNormal(run('eval("const x = 1;"); typeof x;'), 'undefined');
    },
  },
  {
    name: 'direct eval let inside a function does not leak into the caller function scope',
    run() {
      assertNormal(
        run(
          'function f() { eval("let localLet = 5;"); return typeof localLet; } f();',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'eval("let x = 1;") completion value is the empty-normal undefined',
    run() {
      assertNormal(run('eval("let x = 1;");'), undefined);
    },
  },
  {
    name: 'direct eval can read its own let across statements',
    run() {
      assertNormal(run('eval("let x = 41; x + 1;");'), 42);
    },
  },
  {
    name: 'eval("var x = 1;") still leaks x into the sloppy direct-eval caller scope',
    run() {
      assertNormal(run('eval("var x = 7;"); x;'), 7);
    },
  },
  {
    name: 'eval("var x = 1;") creates a deletable binding (configurable)',
    run() {
      assertNormal(
        run('eval("var dx = 9;"); var removed = delete dx; removed;'),
        true,
      );
    },
  },
  {
    name: 'a deleted eval-created var is gone afterwards',
    run() {
      assertNormal(
        run('eval("var dx = 9;"); delete dx; typeof dx;'),
        'undefined',
      );
    },
  },

  {
    name: 'direct eval reads and writes an enclosing let binding',
    run() {
      assertNormal(
        run('function f() { let a = 1; eval("a = 5;"); return a; } f();'),
        5,
      );
    },
  },
  {
    name: 'direct eval inside a block sees that block-scoped binding',
    run() {
      assertNormal(run('var out; { let b = 7; out = eval("b + 1"); } out;'), 8);
    },
  },
  {
    name: 'direct eval inside a catch still hoists its var past the catch scope',
    run() {
      assertNormal(
        run(
          'function f() { try { throw 0; } catch (e) { eval("var hoisted = 3;"); } return hoisted; } f();',
        ),
        3,
      );
    },
  },
  {
    name: 'Annex B.3.5: eval("var x") in a catch whose parameter is x binds the parameter, not a new var',
    run() {
      assertNormal(
        run(
          'var x = "global-x"; var log = ""; function g() { try { throw 8; } catch (x) { eval("var x = 42;"); log += x; } x = "g"; log += x; } g(); x + "|" + log;',
        ),
        'global-x|42g',
      );
    },
  },

  {
    name: 'let x; eval("var x") in the same block is a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'function f() { let x = 1; eval("var x = 2;"); } f();'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'let x at global script scope; eval("var x") is a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'let gx = 1; eval("var gx = 2;");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'let x at global scope; indirect eval("var x") is a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'let gy = 1; (0, eval)("var gy = 2;");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a var collision with an outer const is also a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'function f() { const c = 1; eval("var c = 2;"); } f();'),
        'SyntaxError',
        realm,
      );
    },
  },

  {
    name: 'strict-caller eval var does not leak to the caller',
    run() {
      assertNormal(
        run('"use strict"; eval("var sx = 1;"); typeof sx;'),
        'undefined',
      );
    },
  },
  {
    name: 'strict-source eval var does not leak to the caller',
    run() {
      assertNormal(
        run('eval("\'use strict\'; var sx = 1;"); typeof sx;'),
        'undefined',
      );
    },
  },
  {
    name: 'strict-source eval let does not leak to the caller',
    run() {
      assertNormal(
        run('eval("\'use strict\'; let sy = 1;"); typeof sy;'),
        'undefined',
      );
    },
  },
  {
    name: 'strict eval can still read its own let and var internally',
    run() {
      assertNormal(
        run('eval("\'use strict\'; let a = 2; var b = 3; a + b;");'),
        5,
      );
    },
  },

  {
    name: 'direct eval reading an enclosing binding in its TDZ throws the TDZ ReferenceError',
    run() {
      const realm = createRealm();
      assertGuestThrowMessage(
        runIn(realm, 'function f() { eval("z"); let z = 1; } f();'),
        'ReferenceError',
        "Cannot access 'z' before initialization",
        realm,
      );
    },
  },

  {
    name: 'Annex B.3.3.3: eval block-function alias is suppressed by an enclosing let of the same name',
    run() {
      assertNormal(
        run('{ let f = 1; eval("{ function f(){} }"); } typeof f;'),
        'undefined',
      );
    },
  },
  {
    name: 'direct eval keeps a block generator local without an Annex B alias',
    run() {
      assertNormal(
        run(`
          eval(
            "{ function* blockGenerator(){ return 4; } " +
            "var inside = typeof blockGenerator + ':' + " +
            "blockGenerator().next().value; } " +
            "inside + ':' + typeof blockGenerator;"
          );
        `),
        'function:4:undefined',
      );
    },
  },
];

export default tests;
