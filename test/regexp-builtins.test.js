import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import {
  EngineRegExp,
  escapePatternSource,
} from '../src/runtime/regexp-object.js';
import { compilePattern } from '../src/runtime/regexp-compat.js';

/**
 * Assert that `completion` is a guest throw carrying a guest error whose
 * prototype chain passes through the named constructor's `.prototype`, the
 * same shape `test/errors.test.js` uses.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @returns {EngineObject}
 */
function assertGuestThrow(completion, constructorName, realm) {
  assertSame(completion.type, 'throw');
  if (!(completion.value instanceof EngineObject)) {
    throw new Error(
      `Expected an EngineObject throw value, got ${typeof completion.value}`,
    );
  }

  const ctor = /** @type {any} */ (realm.globalObject.get(constructorName));
  if (!(ctor instanceof EngineObject)) {
    throw new Error(`${constructorName} is not installed on globalObject`);
  }

  const proto = /** @type {EngineObject | undefined} */ (ctor.get('prototype'));
  if (!(proto instanceof EngineObject)) {
    throw new Error(`${constructorName}.prototype is not an EngineObject`);
  }

  let current = /** @type {EngineObject | null} */ (
    /** @type {EngineObject} */ (completion.value).getPrototype()
  );

  while (current !== null) {
    if (current === proto) {
      return /** @type {EngineObject} */ (completion.value);
    }

    current = current.getPrototype();
  }

  throw new Error(
    `Thrown value's prototype chain does not reach ${constructorName}.prototype`,
  );
}

const tests = [
  {
    name: 'new RegExp(pattern, flags) constructs a RegExp object with the expected class tag',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'Object.prototype.toString.call(new RegExp("a", "gi"));',
      );
      assertSame(result.type, 'normal');
      assertSame(result.value, '[object RegExp]');
    },
  },
  {
    name: 'RegExp.prototype is itself a RegExp object per ES5 15.10.6',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(
          realm,
          'Object.prototype.toString.call(RegExp.prototype);',
        ).value,
        '[object RegExp]',
      );
      assertSame(
        evaluateScript(realm, 'RegExp.prototype.source;').value,
        '(?:)',
      );
      assertSame(
        evaluateScript(realm, 'RegExp.prototype.global;').value,
        false,
      );
      assertSame(
        evaluateScript(realm, 'RegExp.prototype.ignoreCase;').value,
        false,
      );
      assertSame(
        evaluateScript(realm, 'RegExp.prototype.multiline;').value,
        false,
      );
      assertSame(
        evaluateScript(realm, 'RegExp.prototype.constructor === RegExp;').value,
        true,
      );
    },
  },
  {
    name: 'the RegExp constructor has length 2, name RegExp, and a fixed prototype property',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, 'RegExp.length;').value, 2);
      assertSame(evaluateScript(realm, 'RegExp.name;').value, 'RegExp');

      const ctor = /** @type {any} */ (realm.globalObject.get('RegExp'));
      const prototypeDescriptor = ctor.getOwnProperty('prototype');
      assertSame(prototypeDescriptor.writable, false);
      assertSame(prototypeDescriptor.enumerable, false);
      assertSame(prototypeDescriptor.configurable, false);

      const globalDescriptor = /** @type {any} */ (
        realm.globalObject.getOwnProperty('RegExp')
      );
      assertSame(globalDescriptor.writable, true);
      assertSame(globalDescriptor.enumerable, false);
      assertSame(globalDescriptor.configurable, true);

      const constructorDescriptor = /** @type {any} */ (
        ctor.get('prototype')
      ).getOwnProperty('constructor');
      assertSame(constructorDescriptor.writable, true);
      assertSame(constructorDescriptor.enumerable, false);
      assertSame(constructorDescriptor.configurable, true);
    },
  },
  {
    name: 'a constructed RegExp exposes source/global/ignoreCase/multiline/lastIndex with ES5 15.10.7 descriptors',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var re = new RegExp("a(b)?", "gim");');
      const re = /** @type {any} */ (evaluateScript(realm, 're;').value);

      for (const [name, value] of [
        ['source', 'a(b)?'],
        ['global', true],
        ['ignoreCase', true],
        ['multiline', true],
      ]) {
        const descriptor = re.getOwnProperty(name);
        assertSame(descriptor.value, value, `${String(name)} value`);
        assertSame(descriptor.writable, false, `${String(name)} writable`);
        assertSame(descriptor.enumerable, false, `${String(name)} enumerable`);
        assertSame(
          descriptor.configurable,
          false,
          `${String(name)} configurable`,
        );
      }

      const lastIndex = re.getOwnProperty('lastIndex');
      assertSame(lastIndex.value, 0);
      assertSame(lastIndex.writable, true);
      assertSame(lastIndex.enumerable, false);
      assertSame(lastIndex.configurable, false);
    },
  },
  {
    name: 'new RegExp() with no arguments produces the empty pattern with no flags',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var re = new RegExp();');
      assertSame(evaluateScript(realm, 're.source;').value, '(?:)');
      assertSame(evaluateScript(realm, 're.global;').value, false);
      assertSame(evaluateScript(realm, 're.ignoreCase;').value, false);
      assertSame(evaluateScript(realm, 're.multiline;').value, false);
    },
  },
  {
    name: 'new RegExp(pattern) coerces a non-object pattern argument with ToString, and defaults flags to none',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, 'new RegExp(42).source;').value, '42');
      assertSame(evaluateScript(realm, 'new RegExp(42).global;').value, false);
    },
  },
  {
    name: 'RegExp(pattern, flags) called without new behaves exactly like construct for a non-RegExp pattern',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'Object.prototype.toString.call(RegExp("a", "g"));',
      );
      assertSame(result.value, '[object RegExp]');
      assertSame(evaluateScript(realm, 'RegExp("a", "g").source;').value, 'a');
      assertSame(evaluateScript(realm, 'RegExp("a", "g").global;').value, true);
    },
  },
  {
    name: 'RegExp(regexpValue) called without new and no flags returns the identical object',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(realm, 'var re = new RegExp("a"); RegExp(re) === re;')
          .value,
        true,
      );
    },
  },
  {
    name: 'new RegExp(regexpValue) with no flags builds a new RegExp copying source and flags',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(
          realm,
          'var re = new RegExp("a", "gi"); var copy = new RegExp(re); ' +
            'copy !== re && copy.source === re.source && copy.global === re.global && copy.ignoreCase === re.ignoreCase;',
        ).value,
        true,
      );
    },
  },
  {
    name: 'new RegExp(regexpValue, flags) with defined flags throws a guest TypeError',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var re = new RegExp("a");');
      const result = evaluateScript(realm, 'new RegExp(re, "g");');
      assertGuestThrow(result, 'TypeError', realm);
    },
  },
  {
    name: 'a syntactically invalid pattern throws a guest SyntaxError',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new RegExp("a{2,1}");');
      assertGuestThrow(result, 'SyntaxError', realm);
    },
  },
  {
    name: 'an unknown or duplicated flag throws a guest SyntaxError',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, 'new RegExp("a", "z");'),
        'SyntaxError',
        realm,
      );
      assertGuestThrow(
        evaluateScript(realm, 'new RegExp("a", "gg");'),
        'SyntaxError',
        realm,
      );
    },
  },
  {
    name: 'each realm gets its own RegExp constructor and prototype',
    run() {
      const realmOne = createRealm();
      const realmTwo = createRealm();

      assertSame(
        realmOne.globalObject.get('RegExp') ===
          realmTwo.globalObject.get('RegExp'),
        false,
      );
      assertSame(
        /** @type {any} */ (realmOne.intrinsics.regExpConstructor).get(
          'prototype',
        ) ===
          /** @type {any} */ (realmTwo.intrinsics.regExpConstructor).get(
            'prototype',
          ),
        false,
      );
    },
  },
  {
    name: 'escapePatternSource implements ES5 15.10.4.1 step 10',
    run() {
      assertSame(escapePatternSource(''), '(?:)');
      assertSame(escapePatternSource('a/b'), 'a\\/b');
      assertSame(escapePatternSource('[/]'), '[/]');
      assertSame(escapePatternSource('a\\/b'), 'a\\/b');
      assertSame(escapePatternSource('a\nb'), 'a\\nb');
      assertSame(escapePatternSource('a\rb'), 'a\\rb');
      assertSame(escapePatternSource('a\u2028b'), 'a\\u2028b');
      assertSame(escapePatternSource('a\u2029b'), 'a\\u2029b');
      assertSame(escapePatternSource('abc'), 'abc');
    },
  },
  {
    name: 'EngineRegExp exposes matchAt and capturingGroups delegating to the compiled pattern',
    run() {
      const compiled = compilePattern('(a)(b)?c', {
        global: false,
        ignoreCase: false,
        multiline: false,
      });
      const engineRegExp = new EngineRegExp(
        null,
        '(a)(b)?c',
        { global: false, ignoreCase: false, multiline: false },
        compiled,
      );

      assertSame(engineRegExp.capturingGroups, 2);
      assertSame(engineRegExp.getClassName(), 'RegExp');
      assertSame(engineRegExp.matchAt('abc', 0) !== null, true);
      assertSame(engineRegExp.matchAt('xyz', 0), null);
    },
  },
  {
    name: 'compilePattern throws an engine-limitation error when the host match result diverges from the validated pattern',
    run() {
      class FakeHostRegExp {
        constructor() {
          this.lastIndex = 0;
        }
        exec() {
          return { 0: 'a', index: 5, length: 1 };
        }
      }

      const compiled = compilePattern(
        'a',
        { global: false, ignoreCase: false, multiline: false },
        /** @type {any} */ (FakeHostRegExp),
      );

      assertThrows(() => compiled.matchAt('a', 0), Error);
    },
  },
];

export default tests;
