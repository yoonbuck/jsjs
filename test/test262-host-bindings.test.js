import { assertSame } from './harness/assert.js';
import { createRealm, evaluateScript } from '../src/index.js';
import { createJsjsTest262Engine } from '../tools/test262/engine.js';

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 * @param {string} [message]
 * @returns {void}
 */
function assertNormal(completion, expected, message) {
  assertSame(completion.type, 'normal', message);
  assertSame(completion.value, expected, message);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @param {string} [message]
 * @returns {void}
 */
function assertGuestTrue(realm, source, message) {
  const completion = evaluateScript(realm, source);
  assertNormal(completion, true, message);
}

/**
 * @returns {{
 *   engine: ReturnType<typeof createJsjsTest262Engine>,
 *   realm: import('../src/runtime/realm.js').Realm,
 *   host: unknown,
 * }}
 */
function createPreparedRealm() {
  const engine = createJsjsTest262Engine();
  const realm = engine.createRealm();
  const host = engine.installHostBindings(realm);
  return { engine, realm, host };
}

const tests = [
  {
    name: 'plain public realms do not expose the Test262 $262 host object',
    run() {
      const plain = createRealm();
      assertNormal(evaluateScript(plain, 'typeof $262'), 'undefined');
    },
  },
  {
    name: 'installed $262 uses realm-owned branding prototypes and descriptors',
    run() {
      const { realm, host } = createPreparedRealm();
      assertSame(realm.globalObject.get('$262'), host);

      assertGuestTrue(
        realm,
        `
        var globalDescriptor = Object.getOwnPropertyDescriptor(this, '$262');
        var createDescriptor = Object.getOwnPropertyDescriptor($262, 'createRealm');
        var evalDescriptor = Object.getOwnPropertyDescriptor($262, 'evalScript');
        Object.prototype.toString.call($262) === '[object Object]' &&
          Object.getPrototypeOf($262) === Object.prototype &&
          Object.getPrototypeOf($262.createRealm) === Function.prototype &&
          Object.getPrototypeOf($262.evalScript) === Function.prototype &&
          $262.global === this &&
          globalDescriptor.value === $262 &&
          globalDescriptor.writable === true &&
          globalDescriptor.enumerable === false &&
          globalDescriptor.configurable === true &&
          Object.getOwnPropertyDescriptor($262, 'global').value === this &&
          Object.getOwnPropertyDescriptor($262, 'global').writable === true &&
          Object.getOwnPropertyDescriptor($262, 'global').enumerable === true &&
          Object.getOwnPropertyDescriptor($262, 'global').configurable === true &&
          createDescriptor.value === $262.createRealm &&
          createDescriptor.writable === true &&
          createDescriptor.enumerable === true &&
          createDescriptor.configurable === true &&
          evalDescriptor.value === $262.evalScript &&
          evalDescriptor.writable === true &&
          evalDescriptor.enumerable === true &&
          evalDescriptor.configurable === true &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'name').value === 'createRealm' &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'name').writable === false &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'name').enumerable === false &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'name').configurable === true &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'length').value === 0 &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'length').writable === false &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'length').enumerable === false &&
          Object.getOwnPropertyDescriptor($262.createRealm, 'length').configurable === true &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'name').value === 'evalScript' &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'name').writable === false &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'name').enumerable === false &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'name').configurable === true &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'length').value === 1 &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'length').writable === false &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'length').enumerable === false &&
          Object.getOwnPropertyDescriptor($262.evalScript, 'length').configurable === true &&
          !('detachArrayBuffer' in $262) &&
          !('gc' in $262) &&
          !('agent' in $262) &&
          !('AbstractModuleSource' in $262);
        `,
        'descriptors and branding',
      );
    },
  },
  {
    name: 'createRealm returns same-Agent child and recursively installed host objects',
    run() {
      const { realm } = createPreparedRealm();

      assertGuestTrue(
        realm,
        `
        var parent = $262;
        var child = parent.createRealm();
        var grandchild = child.createRealm();
        child !== parent &&
          grandchild !== parent &&
          grandchild !== child &&
          child.global !== this &&
          grandchild.global !== this &&
          grandchild.global !== child.global &&
          child.global.$262 === child &&
          grandchild.global.$262 === grandchild &&
          Object.getPrototypeOf(child) !== Object.getPrototypeOf(parent) &&
          child.global.Object !== Object &&
          child.global.Function !== Function &&
          child.global.Object.prototype !== Object.prototype &&
          child.global.Function.prototype !== Function.prototype &&
          Object.getPrototypeOf(child.createRealm) === child.global.Function.prototype &&
          Object.getPrototypeOf(child.evalScript) === child.global.Function.prototype &&
          Symbol.iterator === child.global.Symbol.iterator &&
          Symbol.for('h0') === child.global.Symbol.for('h0');
        `,
        'recursive same-Agent child realms',
      );
    },
  },
  {
    name: 'evalScript evaluates persistent source in its owning realm only',
    run() {
      const { realm } = createPreparedRealm();

      assertGuestTrue(
        realm,
        `
        var child = $262.createRealm();
        $262.evalScript('var persistent = 1; persistent') === 1 &&
          $262.evalScript('persistent += 1; persistent') === 2 &&
          child.evalScript('var childOnly = 3; childOnly') === 3 &&
          typeof childOnly === 'undefined';
        `,
        'persistent parent and child evalScript state',
      );
    },
  },
  {
    name: 'evalScript preserves guest thrown identity',
    run() {
      const { realm } = createPreparedRealm();

      assertGuestTrue(
        realm,
        `
        var marker = {};
        var caught;
        try {
          $262.evalScript('throw marker');
        } catch (error) {
          caught = error;
        }
        caught === marker;
        `,
        'guest thrown identity',
      );
    },
  },
  {
    name: 'evalScript validates primitive strings without host string coercion',
    run() {
      const { realm } = createPreparedRealm();

      assertGuestTrue(
        realm,
        `
        var values = [undefined, Symbol('s'), 1, true, null];
        var objectTouched = false;
        var invalidObject = {
          toString: function () { objectTouched = true; throw new Error('toString called'); },
          valueOf: function () { objectTouched = true; throw new Error('valueOf called'); }
        };
        values.push(invalidObject);
        var allTypeErrors = true;
        for (var i = 0; i < values.length; i += 1) {
          try {
            $262.evalScript(values[i]);
            allTypeErrors = false;
          } catch (error) {
            allTypeErrors = allTypeErrors && error instanceof TypeError;
          }
        }
        try {
          $262.evalScript();
          allTypeErrors = false;
        } catch (error) {
          allTypeErrors = allTypeErrors && error instanceof TypeError;
        }
        allTypeErrors && objectTouched === false;
        `,
        'primitive string validation',
      );
    },
  },
  {
    name: 'evalScript parse and runtime errors are owned by the host object realm',
    run() {
      const { realm } = createPreparedRealm();

      assertGuestTrue(
        realm,
        `
        var child = $262.createRealm();
        var parentSyntax;
        var parentError;
        var childSyntax;
        var childError;
        try { $262.evalScript('{'); } catch (error) { parentSyntax = error; }
        try { $262.evalScript('throw new Error("owned")'); } catch (error) { parentError = error; }
        try { child.evalScript('{'); } catch (error) { childSyntax = error; }
        try { child.evalScript('throw new Error("owned")'); } catch (error) { childError = error; }
        parentSyntax instanceof SyntaxError &&
          !(parentSyntax instanceof child.global.SyntaxError) &&
          parentError instanceof Error &&
          !(parentError instanceof child.global.Error) &&
          childSyntax instanceof child.global.SyntaxError &&
          !(childSyntax instanceof SyntaxError) &&
          childError instanceof child.global.Error &&
          !(childError instanceof Error);
        `,
        'owning realm errors',
      );
    },
  },
  {
    name: 'evalScript rethrows non-parser host SyntaxError failures',
    run() {
      const { realm } = createPreparedRealm();
      const hostSyntaxError = new SyntaxError('host syntax failure');
      realm.globalObject.defineOwnProperty('__hostSyntax', {
        value: realm.createNativeFunction({
          name: '__hostSyntax',
          length: 0,
          call() {
            throw hostSyntaxError;
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });

      try {
        evaluateScript(realm, "$262.evalScript('__hostSyntax()')");
      } catch (error) {
        assertSame(error, hostSyntaxError);
        return;
      }

      throw new Error('Expected host SyntaxError to escape by identity');
    },
  },
];

export default tests;
