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
  // 15.3.2.1 steps 1-6: argument coercion into (P, body)
  // ---------------------------------------------------------------------------
  {
    name: 'zero arguments builds a no-op function returning undefined',
    run() {
      assertNormal(run('new Function()();'), undefined);
    },
  },
  {
    name: 'a single argument is the body, with no parameters',
    run() {
      assertNormal(run('new Function("return 42;")();'), 42);
      assertNormal(run('new Function("return 42;").length;'), 0);
    },
  },
  {
    name: 'many arguments: all but the last are the parameter list',
    run() {
      assertNormal(run('new Function("a", "b", "return a + b;")(2, 3);'), 5);
      assertNormal(run('new Function("a", "b", "return a + b;").length;'), 2);
    },
  },
  {
    name: 'parameters may be split across arguments, and one argument may carry several',
    run() {
      assertNormal(
        run('new Function("a, b", "c", "return a + b + c;")(1, 2, 3);'),
        6,
      );
      assertNormal(
        run('new Function("a", "b, c", "return a + b + c;")(1, 2, 3);'),
        6,
      );
      assertNormal(
        run('new Function("a, b", "c", "return a + b + c;").length;'),
        3,
      );
    },
  },
  {
    name: 'comments and line terminators are allowed inside the parameter text',
    run() {
      assertNormal(
        run('new Function("a /* x */, b", "return a + b;")(3, 4);'),
        7,
      );
      assertNormal(run('new Function("a,\\n b", "return a + b;")(3, 4);'), 7);
    },
  },
  {
    name: 'ToString runs over the parameters then the body, left to right',
    run() {
      assertNormal(
        run(
          'var log = "";' +
            'function mk(tag, out) {' +
            '  return { toString: function () { log += tag; return out; } };' +
            '}' +
            'var f = new Function(mk("p1", "a"), mk("p2", "b"), mk("body", "return a + b;"));' +
            'log + "|" + f(2, 3);',
        ),
        'p1p2body|5',
      );
    },
  },
  {
    name: 'a throwing parameter toString short-circuits before the body is coerced',
    run() {
      assertNormal(
        run(
          'var log = "";' +
            'var bad = { toString: function () { log += "p"; throw "boom"; } };' +
            'var body = { toString: function () { log += "body"; return "return 1;"; } };' +
            'try { new Function(bad, body); } catch (e) { log += ":" + e; }' +
            'log;',
        ),
        'p:boom',
      );
    },
  },
  {
    name: 'a throwing body toString is observed after the parameters',
    run() {
      assertNormal(
        run(
          'var log = "";' +
            'var p = { toString: function () { log += "p"; return "a"; } };' +
            'var body = { toString: function () { log += "body"; throw "boom"; } };' +
            'try { new Function(p, body); } catch (e) { log += ":" + e; }' +
            'log;',
        ),
        'pbody:boom',
      );
    },
  },

  // ---------------------------------------------------------------------------
  // 15.3.2.1 steps 7-8: parse failures throw a guest SyntaxError, and the body
  // composition must not be escapable.
  // ---------------------------------------------------------------------------
  {
    name: 'a body that closes the function early is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("return 1}");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a body that tries to inject trailing tokens is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("}, function(){");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a parameter that is a keyword is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("return", "1");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a body that parses as two function declarations is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("1} function evil(){");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'an incomplete body is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("var x =");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a block comment cannot span the parameter/body boundary',
    run() {
      // ES5.1 15.3.2.1 steps 10 and 11 validate P and body *independently*, so
      // neither fragment may borrow syntax from the other. Weaving them into
      // one source and parsing only the result lets a block comment opened in
      // P be closed in the body, swallowing the synthetic `) {` delimiter and
      // turning two individually invalid fragments into one valid function.
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function(") { return 99; /*", "*/");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'an invalid parameter list is rejected even when the body alone is valid',
    run() {
      // Isolates the parameter-only guard parse (15.3.2.1 step 10): with a body
      // of `/**/` the body-only source parses and the woven source parses (the
      // comment opened in P is closed inside the body), so *only* the
      // parameter-only parse rejects `) { return 99; /*`. Deleting that guard
      // would wrongly accept this input.
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function(") { return 99; /*", "/**/");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a parameter list that is invalid on its own is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("a /*", "*/, b) { return 1; } //");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a body that is invalid on its own is a SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("a", "*/ return 1;");'),
        'SyntaxError',
        realm,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // 15.3.2.1 step 11: Scope is the realm's Global Environment, never the
  // caller's scope.
  // ---------------------------------------------------------------------------
  {
    name: 'a dynamic function closes over the global scope, not the caller',
    run() {
      assertNormal(
        run(
          'function outer() { var local = 1; return new Function("return typeof local;")(); }' +
            'outer();',
        ),
        'undefined',
      );
    },
  },
  {
    name: 'a dynamic function sees global bindings',
    run() {
      assertNormal(run('var shared = 7; new Function("return shared;")();'), 7);
    },
  },

  // ---------------------------------------------------------------------------
  // 15.3.2.1 steps 9-10: strictness comes only from the body directive.
  // ---------------------------------------------------------------------------
  {
    name: 'a strict body installs the caller/arguments poison-pill accessors',
    run() {
      assertNormal(
        run(
          'var f = new Function("\\"use strict\\"; return 1;");' +
            'var d = Object.getOwnPropertyDescriptor(f, "caller");' +
            'typeof d.get + "," + typeof d.set + "," + d.configurable;',
        ),
        'function,function,false',
      );
      assertNormal(
        run(
          'var f = new Function("\\"use strict\\"; return 1;");' +
            'var caught; try { f.caller; } catch (e) { caught = e.name; } caught;',
        ),
        'TypeError',
      );
      assertNormal(
        run(
          'var f = new Function("\\"use strict\\"; return 1;");' +
            'var d = Object.getOwnPropertyDescriptor(f, "arguments");' +
            'typeof d.get + "," + typeof d.set + "," + d.configurable;',
        ),
        'function,function,false',
      );
      assertNormal(
        run(
          'var f = new Function("\\"use strict\\"; return 1;");' +
            'var caught; try { f.arguments; } catch (e) { caught = e.name; } caught;',
        ),
        'TypeError',
      );
      assertNormal(
        run(
          'var f = new Function("\\"use strict\\"; return 1;");' +
            'var caught; try { f.arguments = 1; } catch (e) { caught = e.name; } caught;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'a non-strict dynamic function has no own caller/arguments properties',
    run() {
      assertNormal(
        run(
          'var f = new Function("return 1;");' +
            'typeof Object.getOwnPropertyDescriptor(f, "caller") + "," +' +
            'typeof Object.getOwnPropertyDescriptor(f, "arguments");',
        ),
        'undefined,undefined',
      );
    },
  },
  {
    name: 'caller strictness is never inherited by the body',
    run() {
      // A strict *script* creating a Function whose body has no directive
      // yields a non-strict function: assigning an undeclared global succeeds
      // rather than throwing a ReferenceError.
      assertNormal(
        run(
          '"use strict";' +
            'var f = new Function("undeclaredGlobal = 5; return undeclaredGlobal;");' +
            'f();',
        ),
        5,
      );
    },
  },
  {
    name: 'a strict body rejects duplicate parameter names',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("a", "a", "\\"use strict\\"; return a;");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a non-strict body allows duplicate parameter names',
    run() {
      assertNormal(run('new Function("a", "a", "return a;")(1, 2);'), 2);
    },
  },
  {
    name: 'a strict body rejects eval as a parameter name',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(realm, 'new Function("eval", "\\"use strict\\"; return 1;");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'a strict body rejects arguments as a parameter name',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        runIn(
          realm,
          'new Function("arguments", "\\"use strict\\"; return 1;");',
        ),
        'SyntaxError',
        realm,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Object shape and descriptors (13.2 via EngineFunction).
  // ---------------------------------------------------------------------------
  {
    name: 'the length property is non-writable, non-enumerable, non-configurable',
    run() {
      assertNormal(
        run(
          'var f = new Function("a", "b", "return 1;");' +
            'var d = Object.getOwnPropertyDescriptor(f, "length");' +
            'd.value + "," + d.writable + "," + d.enumerable + "," + d.configurable;',
        ),
        '2,false,false,false',
      );
    },
  },
  {
    name: 'a dynamic function has no own name property (ES5.1, not ES6)',
    run() {
      assertNormal(
        run('var f = new Function("return 1;");' + 'f.hasOwnProperty("name");'),
        false,
      );
    },
  },
  {
    name: 'the prototype property is writable, non-enumerable, non-configurable and inherits Object.prototype',
    run() {
      assertNormal(
        run(
          'var f = new Function("return 1;");' +
            'var d = Object.getOwnPropertyDescriptor(f, "prototype");' +
            'd.writable + "," + d.enumerable + "," + d.configurable + "," +' +
            '(Object.getPrototypeOf(f.prototype) === Object.prototype);',
        ),
        'true,false,false,true',
      );
    },
  },
  {
    name: 'the prototype carries a configurable constructor back-reference',
    run() {
      assertNormal(
        run(
          'var f = new Function("return 1;");' +
            'var d = Object.getOwnPropertyDescriptor(f.prototype, "constructor");' +
            '(d.value === f) + "," + d.writable + "," + d.enumerable + "," + d.configurable;',
        ),
        'true,true,false,true',
      );
    },
  },
  {
    name: 'the Function constructor itself keeps length 1 and a locked prototype',
    run() {
      const realm = createRealm();
      const ctor = /** @type {EngineObject} */ (
        realm.globalObject.get('Function')
      );
      const lengthDescriptor = /** @type {any} */ (
        ctor.getOwnProperty('length')
      );
      assertSame(lengthDescriptor.value, 1);

      const prototypeDescriptor = /** @type {any} */ (
        ctor.getOwnProperty('prototype')
      );
      assertSame(prototypeDescriptor.writable, false);
      assertSame(prototypeDescriptor.enumerable, false);
      assertSame(prototypeDescriptor.configurable, false);
      assertSame(prototypeDescriptor.value, realm.intrinsics.functionPrototype);
    },
  },
  {
    name: 'the global Function property is writable, non-enumerable, configurable',
    run() {
      const realm = createRealm();
      const descriptor = /** @type {any} */ (
        realm.globalObject.getOwnProperty('Function')
      );
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, true);
      assertSame(descriptor.value, realm.intrinsics.functionConstructor);
    },
  },

  // ---------------------------------------------------------------------------
  // Call vs construct equivalence, use as constructor, instanceof.
  // ---------------------------------------------------------------------------
  {
    name: 'calling and constructing Function produce the same kind of object',
    run() {
      assertNormal(run('typeof Function("return 1");'), 'function');
      assertNormal(run('typeof new Function("return 1");'), 'function');
      assertNormal(run('Function("return 1")();'), 1);
      assertNormal(run('new Function("return 1")();'), 1);
    },
  },
  {
    name: 'a dynamic function is usable as a constructor',
    run() {
      assertNormal(
        run(
          'var C = new Function("this.x = 1;");' +
            'var inst = new C();' +
            'inst.x + "," + (inst instanceof C);',
        ),
        '1,true',
      );
    },
  },
  {
    name: 'a dynamic function is an instance of Function',
    run() {
      assertNormal(
        run('(new Function("return 1")) instanceof Function;'),
        true,
      );
    },
  },
  {
    name: 'Function.prototype.toString of a dynamic function does not throw',
    run() {
      assertNormal(
        run(
          'typeof Function.prototype.toString.call(new Function("return 1"));',
        ),
        'string',
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Realm isolation: the created function belongs to the constructor's realm.
  // ---------------------------------------------------------------------------
  {
    name: 'a dynamic function is allocated in the constructor owner realm, not the caller realm',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();

      // Publish realm A's Function constructor as realm B's `Function`.
      realmB.globalObject.defineOwnProperty('Function', {
        value: realmA.intrinsics.functionConstructor,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const result = runIn(realmB, 'new Function("return 1");');
      assertSame(result.type, 'normal');

      const created = /** @type {EngineObject} */ (result.value);
      assertSame(created.getPrototype(), realmA.intrinsics.functionPrototype);
      assertSame(
        created.getPrototype() === realmB.intrinsics.functionPrototype,
        false,
      );
    },
  },
  {
    name: 'a cross-realm dynamic function closes over its owner realm global scope',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();

      realmA.globalObject.defineOwnProperty('marker', {
        value: 'A',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realmB.globalObject.defineOwnProperty('marker', {
        value: 'B',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realmB.globalObject.defineOwnProperty('Function', {
        value: realmA.intrinsics.functionConstructor,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const result = runIn(realmB, 'new Function("return marker;")();');
      assertNormal(result, 'A');
    },
  },
];

export default tests;
