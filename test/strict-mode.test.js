import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { parseScript } from '../src/parser.js';
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
  // Directive detection
  // ---------------------------------------------------------------------------
  {
    name: 'hasUseStrictDirective: leading "use strict" is detected via Acorn directive property',
    run() {
      const p = parseScript('"use strict"; var x = 1;');
      assertSame(p.body[0].directive, 'use strict');
      assertSame(p.body[1].directive, undefined);
    },
  },
  {
    name: 'hasUseStrictDirective: non-leading "use strict" is NOT a directive',
    run() {
      const p = parseScript('var x = 1; "use strict";');
      assertSame(p.body[0].directive, undefined);
      assertSame(p.body[1].directive, undefined);
    },
  },

  // ---------------------------------------------------------------------------
  // Script-level strict mode
  // ---------------------------------------------------------------------------
  {
    name: 'strict script: assignment to undeclared variable throws ReferenceError',
    run() {
      const realm = createRealm();
      const result = runIn(realm, '"use strict"; undeclaredVar = 42;');
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },
  {
    name: 'non-strict script: assignment to undeclared variable creates a global',
    run() {
      assertNormal(run('undeclaredVar = 42; undeclaredVar;'), 42);
    },
  },

  // ---------------------------------------------------------------------------
  // Function-level strict mode
  // ---------------------------------------------------------------------------
  {
    name: 'function with "use strict" directive is strict even inside non-strict script',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        'function f() { "use strict"; undeclaredVar = 99; } f();',
      );
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },
  {
    name: 'function nested in strict script inherits strictness without repeating directive',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '"use strict"; function f() { undeclaredVar = 99; } f();',
      );
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },
  {
    name: 'function nested in strict function is strict without own directive',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        'function outer() { "use strict"; function inner() { undeclaredVar = 99; } inner(); } outer();',
      );
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },
  {
    name: 'non-strict function inside strict script can access outer scope normally',
    run() {
      assertNormal(
        run('"use strict"; var x = 1; function f() { return x; } f();'),
        1,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // this binding
  // ---------------------------------------------------------------------------
  {
    name: 'strict function called without receiver has this === undefined',
    run() {
      assertNormal(
        run('function f() { "use strict"; return typeof this; } f();'),
        'undefined',
      );
    },
  },
  {
    name: 'non-strict function called without receiver has this === global object',
    run() {
      const realm = createRealm();
      const result = runIn(realm, 'function f() { return this; } f();');
      assertSame(result.type, 'normal');
      assertSame(result.value, realm.globalObject);
    },
  },

  // ---------------------------------------------------------------------------
  // arguments object mapping
  // ---------------------------------------------------------------------------
  {
    name: 'non-strict function: arguments[0] is aliased to the first parameter',
    run() {
      assertNormal(
        run('function f(a) { a = 99; return arguments[0]; } f(1);'),
        99,
      );
    },
  },
  {
    name: 'strict function: arguments[0] is NOT aliased to the first parameter',
    run() {
      assertNormal(
        run(
          'function f(a) { "use strict"; a = 99; return arguments[0]; } f(1);',
        ),
        1,
      );
    },
  },
  {
    name: 'strict function: mutating arguments[0] does NOT change the parameter',
    run() {
      assertNormal(
        run(
          'function f(a) { "use strict"; arguments[0] = 99; return a; } f(1);',
        ),
        1,
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Acorn static strict-mode syntax rejection
  // ---------------------------------------------------------------------------
  {
    name: 'parseScript rejects duplicate parameter names in strict mode',
    run() {
      let threw = false;

      try {
        parseScript('"use strict"; function f(a, a) {}');
      } catch (e) {
        threw = true;
        assertSame(e instanceof SyntaxError, true);
      }

      assertSame(threw, true);
    },
  },
  {
    name: 'parseScript rejects binding "eval" in strict mode',
    run() {
      let threw = false;

      try {
        parseScript('"use strict"; var eval = 1;');
      } catch (e) {
        threw = true;
        assertSame(e instanceof SyntaxError, true);
      }

      assertSame(threw, true);
    },
  },

  // ---------------------------------------------------------------------------
  // Poison-pill caller/arguments on strict functions
  // ---------------------------------------------------------------------------
  {
    name: 'strict function .caller read throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(realm, 'function f() { "use strict"; } f.caller;');
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'strict function .caller write throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        'function f() { "use strict"; } f.caller = 1;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'strict function .arguments read throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        'function f() { "use strict"; } f.arguments;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'strict function .arguments write throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        'function f() { "use strict"; } f.arguments = 1;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'non-strict function .caller reads as undefined (no throw)',
    run() {
      assertNormal(run('function f() {} f.caller;'), undefined);
    },
  },
  {
    name: 'non-strict function .arguments reads as undefined (no throw)',
    run() {
      assertNormal(run('function f() {} f.arguments;'), undefined);
    },
  },

  // ---------------------------------------------------------------------------
  // Poison-pill on strict function arguments object
  // ---------------------------------------------------------------------------
  {
    name: 'inside strict function, arguments.callee throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '(function() { "use strict"; return arguments.callee; })();',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'inside strict function, arguments.caller throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '(function() { "use strict"; return arguments.caller; })();',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'inside non-strict function, arguments.callee returns the function',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        'function f() { return arguments.callee === f; } f();',
      );
      assertNormal(result, true);
    },
  },

  // ---------------------------------------------------------------------------
  // Strict assignment to a non-writable property
  // ---------------------------------------------------------------------------
  {
    name: 'strict script: assigning to a non-writable property (fn.length) throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '"use strict"; function f(a, b) {} f.length = 5;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'non-strict script: assigning to a non-writable property silently no-ops',
    run() {
      assertNormal(run('function f(a, b) {} f.length = 5; f.length;'), 2);
    },
  },

  // ---------------------------------------------------------------------------
  // Strict compound assignment and update expression on non-writable property
  // ---------------------------------------------------------------------------
  {
    name: 'strict script: compound assignment += to non-writable fn.length throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '"use strict"; function f(a, b) {} f.length += 1;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'strict script: prefix ++ on non-writable fn.length throws TypeError',
    run() {
      const realm = createRealm();
      const result = runIn(
        realm,
        '"use strict"; function f(a, b) {} f.length++;',
      );
      assertGuestThrow(result, 'TypeError', realm);
    },
  },

  // ---------------------------------------------------------------------------
  // delete inside strict try/catch
  // ---------------------------------------------------------------------------
  {
    // ES5 11.4.1 step 5: deleting a non-configurable property in strict mode
    // throws a TypeError. Inside a try/catch, that TypeError must be catchable
    // as a normal guest throw.
    name: 'strict try/catch: delete of non-configurable property throws catchable TypeError',
    run() {
      const realm = createRealm();
      // f.length is non-configurable; deleting it in strict mode must throw.
      const result = runIn(
        realm,
        [
          '"use strict";',
          'var caught;',
          'try {',
          '  function f(a, b) {}',
          '  delete f.length;',
          '} catch (e) {',
          '  caught = e;',
          '}',
          'caught instanceof TypeError;',
        ].join('\n'),
      );
      // The TypeError must have been caught and `caught instanceof TypeError`
      // evaluated as true.
      assertNormal(result, true);
    },
  },
];

export default tests;
