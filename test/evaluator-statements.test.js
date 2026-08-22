import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { parseScript } from '../src/parser.js';
import { evaluate } from '../src/evaluator/index.js';
import { STATEMENT_TYPES } from '../src/evaluator/statements.js';
import { EXPRESSION_TYPES } from '../src/evaluator/expressions.js';
import { createAgent } from '../src/runtime/agent.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { createIterResultObject } from '../src/runtime/iterator.js';
import { callCallable } from '../src/runtime/capabilities.js';
import { HostileExotic } from './harness/hostile-exotic.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineGlobal(realm, name, value) {
  realm.globalObject.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {EngineObject} iterator
 * @param {() => void} [onEnumerate]
 * @returns {EngineObject}
 */
function createEnumeratingTarget(realm, iterator, onEnumerate = () => {}) {
  class EnumeratingTarget extends EngineObject {
    enumerate() {
      onEnumerate();
      return iterator;
    }
  }

  return new EnumeratingTarget(realm.intrinsics.objectPrototype);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {readonly unknown[]} values
 * @param {{
 *   returnBehavior?: 'object' | 'getter-throw' | 'call-throw' | 'non-object',
 * }} [options]
 * @returns {{
 *   iterator: EngineObject,
 *   state: {
 *     index: number,
 *     nextCalls: number,
 *     returnGets: number,
 *     returnCalls: number,
 *     returnRealms: (import('../src/runtime/realm.js').Realm | null)[],
 *   },
 * }}
 */
function createForInIterator(realm, values, options = {}) {
  const state = {
    index: 0,
    nextCalls: 0,
    returnGets: 0,
    returnCalls: 0,
    returnRealms:
      /** @type {(import('../src/runtime/realm.js').Realm | null)[]} */ ([]),
  };
  const iterator = new EngineObject(realm.intrinsics.objectPrototype);
  iterator.defineOwnProperty('next', {
    value: realm.createNativeFunction({
      name: 'next',
      length: 0,
      call() {
        state.nextCalls += 1;
        if (state.index >= values.length) {
          return createIterResultObject(realm, undefined, true);
        }
        const value = values[state.index];
        state.index += 1;
        return createIterResultObject(realm, value, false);
      },
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  const returnBehavior = options.returnBehavior ?? 'object';
  if (returnBehavior === 'getter-throw') {
    iterator.defineOwnProperty('return', {
      get: realm.createNativeFunction({
        name: 'get return',
        length: 0,
        call() {
          state.returnGets += 1;
          state.returnRealms.push(realm.agent.activeExecutionRealm);
          throw new GuestErrorSignal('TypeError', 'return getter');
        },
      }),
      enumerable: false,
      configurable: true,
    });
  } else {
    iterator.defineOwnProperty('return', {
      value: realm.createNativeFunction({
        name: 'return',
        length: 0,
        call() {
          state.returnCalls += 1;
          state.returnRealms.push(realm.agent.activeExecutionRealm);
          if (returnBehavior === 'call-throw') {
            throw new GuestErrorSignal('TypeError', 'return call');
          }
          if (returnBehavior === 'non-object') {
            return 1;
          }
          return createIterResultObject(realm, undefined, true);
        },
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  return { iterator, state };
}

/**
 * @param {import('../src/runtime/realm.js').Realm} evaluatingRealm
 * @param {import('../src/runtime/realm.js').Realm} boundaryRealm
 * @param {'object' | 'getter-throw' | 'call-throw' | 'non-object'} returnBehavior
 */
function createDelegatedForInSource(
  evaluatingRealm,
  boundaryRealm,
  returnBehavior,
) {
  const { iterator, state } = createForInIterator(boundaryRealm, ['tail'], {
    returnBehavior,
  });
  const boundary = new HostileExotic(
    boundaryRealm.intrinsics.objectPrototype,
    iterator,
  );
  const source = new EngineObject(evaluatingRealm.intrinsics.objectPrototype);
  source.defineOwnProperty('own', {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  if (!source.setPrototypeOf(boundary)) {
    throw new Error('Expected delegated for-in prototype installation');
  }
  return { boundary, source, state };
}

const tests = [
  {
    name: 'the statement and expression dispatch tables are disjoint',
    run() {
      for (const type of STATEMENT_TYPES) {
        assertSame(EXPRESSION_TYPES.has(type), false);
      }
    },
  },
  {
    name: 'evaluate() dispatches a node type in neither table to an explicit unsupported-node error',
    run() {
      const realm = createRealm();
      const context = {
        realm,
        env: realm.globalEnvironment,
        variableEnv: realm.globalEnvironment,
        strict: false,
        thisValue: realm.globalObject,
      };

      const type = 'NotANode';
      const error = assertThrows(
        () => evaluate({ type, body: null }, context),
        Error,
      );
      assertSame(error.name, 'UnsupportedNodeError');
      assertSame(/** @type {any} */ (error).nodeType, type);
    },
  },
  {
    name: 'evaluate() dispatches statement nodes to a completion record and expression nodes to a value',
    run() {
      const realm = createRealm();
      const context = {
        realm,
        env: realm.globalEnvironment,
        variableEnv: realm.globalEnvironment,
        strict: false,
        thisValue: realm.globalObject,
      };

      const statementProgram = parseScript('1 + 2;');
      const completion = /** @type {{ type: string, value: unknown }} */ (
        evaluate(statementProgram.body[0], context)
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 3);

      const expressionProgram = parseScript('4 * 5;');
      const value = evaluate(expressionProgram.body[0].expression, context);
      assertSame(value, 20);
    },
  },
  {
    name: 'expression statements evaluate to their expression value',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, '1;');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 1);
    },
  },
  {
    name: 'empty statements produce an empty (undefined) completion value',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, ';');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, undefined);
    },
  },
  {
    name: 'block statements evaluate their nested statement list',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, '{ 1; 2; }');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 2);
    },
  },
  {
    name: 'block statement completion values thread through empty completions',
    run() {
      const realm = createRealm();
      // `var x;` and `;` both have an empty completion value, so the block's
      // completion value should still be the last *meaningful* value (1).
      const completion = evaluateScript(realm, '{ 1; var x; ; }');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 1);
    },
  },
  {
    name: 'var declarations create global bindings initialized to undefined',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x;');

      assertSame(realm.globalObject.hasProperty('x'), true);
      assertSame(realm.globalObject.get('x'), undefined);
    },
  },
  {
    name: 'var declarations with initializers assign the initializer value',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, 'var x = 41 + 1;');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, undefined);
      assertSame(realm.globalObject.get('x'), 42);
    },
  },
  {
    name: 'var declarations support multiple comma-separated declarators',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var a = 1, b = 2, c;');

      assertSame(realm.globalObject.get('a'), 1);
      assertSame(realm.globalObject.get('b'), 2);
      assertSame(realm.globalObject.get('c'), undefined);
    },
  },
  {
    name: 'var declarations are hoisted before the statement that declares them runs',
    run() {
      const realm = createRealm();
      // Reading `x` before its `var` statement executes must see the
      // hoisted `undefined` binding, not an unresolvable-reference error.
      const completion = evaluateScript(realm, 'var y = x; var x = 1;');

      assertSame(completion.type, 'normal');
      assertSame(realm.globalObject.get('y'), undefined);
      assertSame(realm.globalObject.get('x'), 1);
    },
  },
  {
    name: 'var declarations inside blocks, if, and loop bodies hoist to the global scope',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'if (true) { var insideIf = 1; } while (false) { var insideWhile = 2; }',
      );

      assertSame(realm.globalObject.hasProperty('insideIf'), true);
      assertSame(realm.globalObject.get('insideIf'), 1);
      assertSame(realm.globalObject.hasProperty('insideWhile'), true);
      assertSame(realm.globalObject.get('insideWhile'), undefined);
    },
  },
  {
    name: 'if executes the consequent when the (coerced) test is truthy',
    run() {
      assertSame(evaluateScript(createRealm(), 'if (true) { 1; }').value, 1);
      assertSame(
        evaluateScript(createRealm(), 'if (1) { "yes"; }').value,
        'yes',
      );
    },
  },
  {
    name: 'if executes the alternate when the test is falsy',
    run() {
      const completion = evaluateScript(
        createRealm(),
        'if (false) { "yes"; } else { "no"; }',
      );
      assertSame(completion.value, 'no');

      const coerced = evaluateScript(
        createRealm(),
        'if (0) { "yes"; } else { "no"; }',
      );
      assertSame(coerced.value, 'no');
    },
  },
  {
    name: 'if without an else and a falsy test has an empty completion value',
    run() {
      const completion = evaluateScript(createRealm(), 'if (false) { 1; }');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, undefined);
    },
  },
  {
    name: 'while loops run their body while the test is truthy and thread the last value',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var i = 0; var sum = 0; while (i < 3) { sum = sum + i; i = i + 1; }',
      );

      assertSame(realm.globalObject.get('i'), 3);
      assertSame(realm.globalObject.get('sum'), 3);
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 3);
    },
  },
  {
    name: 'while loops that never run their body have an empty completion value',
    run() {
      const completion = evaluateScript(createRealm(), 'while (false) { 1; }');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, undefined);
    },
  },
  {
    name: 'do-while loops execute their body at least once even if the test starts false',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var i = 5; var count = 0; do { count = count + 1; i = i - 1; } while (i > 10);',
      );

      assertSame(realm.globalObject.get('count'), 1);
      assertSame(realm.globalObject.get('i'), 4);
    },
  },
  {
    name: 'for loops run init once, test before each iteration, and update after each iteration',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var sum = 0; for (var i = 0; i < 5; i = i + 1) { sum = sum + i; }',
      );

      assertSame(realm.globalObject.get('sum'), 10);
      assertSame(realm.globalObject.get('i'), 5);
      assertSame(completion.type, 'normal');
    },
  },
  {
    name: 'for loops with an omitted test run until an explicit break',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var i = 0; for (;;) { if (i === 3) { break; } i = i + 1; }',
      );

      assertSame(realm.globalObject.get('i'), 3);
    },
  },
  {
    name: 'break exits a while loop with a normal completion',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var i = 0; while (true) { if (i === 3) { break; } i = i + 1; }',
      );

      assertSame(completion.type, 'normal');
      assertSame(realm.globalObject.get('i'), 3);
    },
  },
  {
    name: 'break exits a do-while loop with the last meaningful completion value',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var i = 0; do { if (i === 3) { break; } i = i + 1; } while (true);',
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 3);
      assertSame(realm.globalObject.get('i'), 3);
    },
  },
  {
    name: 'break inside a for loop stops before the update clause runs again',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var found = -1; for (var i = 0; i < 10; i = i + 1) { if (i === 4) { found = i; break; } }',
      );

      assertSame(realm.globalObject.get('found'), 4);
      assertSame(realm.globalObject.get('i'), 4);
    },
  },
  {
    name: 'continue in a while loop skips the remainder of the current iteration only',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var i = 0; var sum = 0; while (i < 5) { i = i + 1; if (i % 2 === 0) { continue; } sum = sum + i; }',
      );

      assertSame(realm.globalObject.get('i'), 5);
      assertSame(realm.globalObject.get('sum'), 9); // 1 + 3 + 5
    },
  },
  {
    name: 'continue in a do-while loop still evaluates the test after a continued iteration',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var i = 0; var sum = 0; var checks = 0; do { i = i + 1; if (i % 2 === 0) { continue; } sum = sum + i; } while ((checks = checks + 1) && i < 5);',
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 9);
      assertSame(realm.globalObject.get('checks'), 5);
      assertSame(realm.globalObject.get('i'), 5);
      assertSame(realm.globalObject.get('sum'), 9); // 1 + 3 + 5
    },
  },
  {
    name: 'continue in a for loop still runs the update clause before the next test',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var order = ""; for (var i = 0; (order = order + "T") && i < 5; i = ((order = order + "U") && (i + 1))) { if (i === 1) { i = i + 1; order = order + "C"; continue; } order = order + i; }',
      );

      assertSame(realm.globalObject.get('i'), 5);
      assertSame(realm.globalObject.get('order'), 'T0UTCUT3UT4UT');
    },
  },
  {
    name: 'break in a nested loop only exits the innermost loop',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var outerCount = 0; ' +
          'for (var i = 0; i < 3; i = i + 1) { ' +
          'for (var j = 0; j < 3; j = j + 1) { ' +
          'if (j === 1) { break; } outerCount = outerCount + 1; } }',
      );

      assertSame(realm.globalObject.get('outerCount'), 3);
    },
  },
  {
    name: 'a function declaration statement produces no completion value of its own',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, '1; function f() {}');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 1);
      assertSame(typeof realm.globalObject.get('f'), 'object');
    },
  },
  {
    name: 'evaluateScript dispatches with statements instead of rejecting them',
    run() {
      const realm = createRealm();

      // `with` was previously an explicitly unsupported node; it now
      // dispatches like any other statement and resolves names against its
      // object environment.
      const completion = evaluateScript(
        realm,
        'var o = { a: 3 }; var r; with (o) { r = a; } r;',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 3);
    },
  },
  {
    name: 'for-in enumerates own then inherited enumerable string keys once each, skipping non-enumerable shadowed names',
    run() {
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'var keys = []; for (var k in { a: 1, b: 2 }) { keys.push(k); } keys.join(",");',
        ).value,
        'a,b',
      );

      // A name already visited earlier in the prototype chain is never
      // revisited later, even though the parent's own copy is enumerable
      // (ECMA-262 12.6.4 NOTE: shadowing checks own-property presence, not
      // enumerability).
      assertSame(
        evaluateScript(
          realm,
          'var Base = function () {}; ' +
            'Base.prototype.shared = "base"; ' +
            'var child = new Base(); ' +
            'child.shared = "own"; ' +
            'var keys = []; for (var k in child) { keys.push(k); } keys.join(",");',
        ).value,
        'shared',
      );

      // `null`/`undefined` right-hand sides short-circuit to a no-op loop
      // rather than throwing (12.6.4 step 2).
      assertSame(
        evaluateScript(
          realm,
          'var ran = false; for (var k in null) { ran = true; } ran;',
        ).value,
        false,
      );
      assertSame(
        evaluateScript(
          realm,
          'var ran = false; for (var k in undefined) { ran = true; } ran;',
        ).value,
        false,
      );
    },
  },
  {
    name: 'synchronous for-in consumes arbitrary Enumerate iterators through public iterator operations',
    run() {
      /** @type {{ label: string, message: string, createIterator: (realm: import('../src/runtime/realm.js').Realm) => EngineObject }[]} */
      const cases = [
        {
          label: 'next getter',
          message: 'next getter',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              get: realm.createNativeFunction({
                name: 'get next',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'next getter');
                },
              }),
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'non-callable next',
          message: 'Enumerate iterator next is not callable',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: 1,
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'next call',
          message: 'next call',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'next call');
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'non-object result',
          message: 'Iterator result is not an object',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return 1;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'done getter',
          message: 'done getter',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            const result = new EngineObject(realm.intrinsics.objectPrototype);
            result.defineOwnProperty('done', {
              get: realm.createNativeFunction({
                name: 'get done',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'done getter');
                },
              }),
              enumerable: true,
              configurable: true,
            });
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return result;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'value getter',
          message: 'value getter',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            const result = createIterResultObject(realm, undefined, false);
            result.defineOwnProperty('value', {
              get: realm.createNativeFunction({
                name: 'get value',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'value getter');
                },
              }),
              enumerable: true,
              configurable: true,
            });
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return result;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
        {
          label: 'symbol value',
          message: 'Enumerate iterator value is not a string',
          createIterator(realm) {
            const iterator = new EngineObject(realm.intrinsics.objectPrototype);
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return createIterResultObject(realm, Symbol('key'), false);
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
            return iterator;
          },
        },
      ];

      for (const entry of cases) {
        const realm = createRealm();
        let enumerateCalls = 0;
        const target = createEnumeratingTarget(
          realm,
          entry.createIterator(realm),
          () => {
            enumerateCalls += 1;
          },
        );
        defineGlobal(realm, 'source', target);

        const completion = evaluateScript(
          realm,
          'for (var key in source) { throw new Error("body must not run"); }',
        );
        assertSame(
          completion.type,
          'throw',
          `${entry.label} must become a guest abrupt completion`,
        );
        assertSame(
          /** @type {EngineObject} */ (completion.value).get('message'),
          entry.message,
        );
        assertSame(enumerateCalls, 1);
      }
    },
  },
  {
    name: 'synchronous for-in closes delivered Enumerate values on abrupt exits',
    run() {
      /** @type {string[]} */
      const failures = [];
      /**
       * @param {string} label
       * @param {unknown} actual
       * @param {unknown} expected
       */
      function expect(label, actual, expected) {
        if (!Object.is(actual, expected)) {
          failures.push(
            `${label}: expected ${String(expected)}, received ${String(actual)}`,
          );
        }
      }

      const cases = [
        {
          label: 'break',
          source: 'for (var key in source) { break; } "break";',
          returnBehavior: 'object',
          type: 'normal',
          value: 'break',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'return',
          source:
            'function stop() { for (var key in source) { return "returned"; } } stop();',
          returnBehavior: 'object',
          type: 'normal',
          value: 'returned',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'throw precedence',
          source: 'for (var key in source) { throw new Error("body"); }',
          returnBehavior: 'call-throw',
          type: 'throw',
          value: 'body',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'return getter',
          source: 'for (var key in source) { break; }',
          returnBehavior: 'getter-throw',
          type: 'throw',
          value: 'return getter',
          returnCalls: 0,
          returnGets: 1,
        },
        {
          label: 'return call',
          source: 'for (var key in source) { break; }',
          returnBehavior: 'call-throw',
          type: 'throw',
          value: 'return call',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'non-object return',
          source: 'for (var key in source) { break; }',
          returnBehavior: 'non-object',
          type: 'throw',
          value: 'Iterator return method returned a non-object value',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'outer break',
          source:
            'outer: { for (var key in source) { break outer; } } "outer break";',
          returnBehavior: 'object',
          type: 'normal',
          value: 'outer break',
          returnCalls: 1,
          returnGets: 0,
        },
        {
          label: 'outer continue',
          source:
            'var count = 0; outer: while (count < 1) { count += 1; ' +
            'for (var key in source) { continue outer; } } count;',
          returnBehavior: 'object',
          type: 'normal',
          value: 1,
          returnCalls: 1,
          returnGets: 0,
        },
      ];

      for (const entry of cases) {
        const realm = createRealm();
        const { iterator, state } = createForInIterator(realm, ['key'], {
          returnBehavior:
            /** @type {'object' | 'getter-throw' | 'call-throw' | 'non-object'} */ (
              entry.returnBehavior
            ),
        });
        defineGlobal(realm, 'source', createEnumeratingTarget(realm, iterator));
        const completion = evaluateScript(realm, entry.source);
        expect(`${entry.label} completion`, completion.type, entry.type);
        const value =
          completion.value instanceof EngineObject
            ? completion.value.get('message', completion.value)
            : completion.value;
        expect(`${entry.label} value`, value, entry.value);
        expect(
          `${entry.label} return calls`,
          state.returnCalls,
          entry.returnCalls,
        );
        expect(
          `${entry.label} return getter reads`,
          state.returnGets,
          entry.returnGets,
        );
      }

      const targetRealm = createRealm();
      const targetFailure = createForInIterator(targetRealm, ['key'], {
        returnBehavior: 'call-throw',
      });
      defineGlobal(
        targetRealm,
        'source',
        createEnumeratingTarget(targetRealm, targetFailure.iterator),
      );
      const targetCompletion = evaluateScript(
        targetRealm,
        'var target = null; for (target.key in source) {}',
      );
      expect('target failure completion', targetCompletion.type, 'throw');
      expect('target failure return calls', targetFailure.state.returnCalls, 1);

      const continueRealm = createRealm();
      const continued = createForInIterator(continueRealm, ['key']);
      defineGlobal(
        continueRealm,
        'source',
        createEnumeratingTarget(continueRealm, continued.iterator),
      );
      const continuedCompletion = evaluateScript(
        continueRealm,
        'for (var key in source) { continue; } "exhausted";',
      );
      expect('owned continue completion', continuedCompletion.type, 'normal');
      expect('owned continue value', continuedCompletion.value, 'exhausted');
      expect('owned continue return calls', continued.state.returnCalls, 0);
      expect('owned continue next calls', continued.state.nextCalls, 2);
      assertSame(failures.join('\n'), '');
    },
  },
  {
    name: 'synchronous for-in closes a hostile prototype remainder on every early exit',
    run() {
      const cases = [
        {
          label: 'break',
          source: 'for (var key in source) { break; } "break";',
          returnBehavior: 'object',
          value: 'break',
        },
        {
          label: 'return',
          source:
            'function stop() { for (var key in source) { return "returned"; } } stop();',
          returnBehavior: 'object',
          value: 'returned',
        },
        {
          label: 'throw precedence',
          source:
            'var message; try { for (var key in source) { throw new Error("body"); } } ' +
            'catch (error) { message = error.message; } message;',
          returnBehavior: 'call-throw',
          value: 'body',
        },
        {
          label: 'abrupt close',
          source:
            'var message; try { for (var key in source) { break; } } ' +
            'catch (error) { message = error.message; } message;',
          returnBehavior: 'call-throw',
          value: 'return call',
        },
      ];

      for (const entry of cases) {
        const evaluatingRealm = createRealm({ agent: createAgent() });
        const boundaryRealm = createRealm({ agent: createAgent() });
        const { boundary, source, state } = createDelegatedForInSource(
          evaluatingRealm,
          boundaryRealm,
          /** @type {'object' | 'call-throw'} */ (entry.returnBehavior),
        );
        defineGlobal(evaluatingRealm, 'source', source);

        const completion = evaluateScript(evaluatingRealm, entry.source);
        assertSame(completion.type, 'normal', entry.label);
        assertSame(completion.value, entry.value, entry.label);
        assertSame(state.nextCalls, 0, entry.label);
        assertSame(state.returnCalls, 1, entry.label);
        assertSame(state.returnGets, 0, entry.label);
        assertSame(state.returnRealms.length, 1, entry.label);
        assertSame(state.returnRealms[0], boundaryRealm, entry.label);
        assertSame(
          JSON.stringify(boundary.calls),
          '[["enumerate"]]',
          entry.label,
        );
        assertSame(
          evaluatingRealm.agent.activeExecutionRealm,
          null,
          entry.label,
        );
        assertSame(boundaryRealm.agent.activeExecutionRealm, null, entry.label);
        assertSame(
          evaluatingRealm.agent._synchronousCallChain,
          null,
          entry.label,
        );
        assertSame(
          boundaryRealm.agent._synchronousCallChain,
          null,
          entry.label,
        );
        assertSame(
          evaluatingRealm.agent._generatorHostChain,
          null,
          entry.label,
        );
        assertSame(boundaryRealm.agent._generatorHostChain, null, entry.label);
      }
    },
  },
  {
    name: 'synchronous for-in leaves IteratorStep and IteratorValue failures unclosed',
    run() {
      /** @type {{
       *   label: string,
       *   install: (
       *     realm: import('../src/runtime/realm.js').Realm,
       *     iterator: EngineObject,
       *   ) => void,
       *   message: string,
       * }[]} */
      const cases = [
        {
          label: 'step',
          install(realm, iterator) {
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'next failure');
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
          },
          message: 'next failure',
        },
        {
          label: 'value',
          install(realm, iterator) {
            const result = createIterResultObject(realm, 'key', false);
            result.defineOwnProperty('value', {
              get: realm.createNativeFunction({
                name: 'get value',
                length: 0,
                call() {
                  throw new GuestErrorSignal('TypeError', 'value failure');
                },
              }),
              enumerable: true,
              configurable: true,
            });
            iterator.defineOwnProperty('next', {
              value: realm.createNativeFunction({
                name: 'next',
                length: 0,
                call() {
                  return result;
                },
              }),
              writable: true,
              enumerable: false,
              configurable: true,
            });
          },
          message: 'value failure',
        },
      ];

      for (const entry of cases) {
        const realm = createRealm();
        const { iterator, state } = createForInIterator(realm, ['key']);
        entry.install(realm, iterator);
        defineGlobal(realm, 'source', createEnumeratingTarget(realm, iterator));
        const completion = evaluateScript(
          realm,
          'for (var key in source) { throw new Error("body"); }',
        );
        assertSame(completion.type, 'throw', entry.label);
        assertSame(
          /** @type {EngineObject} */ (completion.value).get('message'),
          entry.message,
          entry.label,
        );
        assertSame(state.returnCalls, 0, entry.label);
        assertSame(state.returnGets, 0, entry.label);
      }
    },
  },
  {
    name: 'synchronous for-in stops live rechecks at a dispatched exotic remainder',
    run() {
      const realm = createRealm();
      const remainder = createForInIterator(realm, []);
      let enumerateCalls = 0;
      let boundaryGets = 0;
      class EnumerateBoundary extends EngineObject {
        enumerate() {
          enumerateCalls += 1;
          return remainder.iterator;
        }

        /**
         * @param {import('../src/runtime/descriptors.js').PropertyKey} key
         */
        getOwnProperty(key) {
          if (key === 'duplicate') {
            boundaryGets += 1;
            throw new Error('live lookup crossed Enumerate boundary');
          }
          return super.getOwnProperty(key);
        }
      }

      const boundary = new EnumerateBoundary(realm.intrinsics.objectPrototype);
      const source = new EngineObject(boundary);
      source.defineOwnProperty('first', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      source.defineOwnProperty('duplicate', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(realm, 'source', source);

      const completion = evaluateScript(
        realm,
        'var keys = []; for (var key in source) { keys.push(key); delete source.duplicate; } keys.join(",");',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'first');
      assertSame(enumerateCalls, 1);
      assertSame(boundaryGets, 0);
    },
  },
  {
    name: 'synchronous for-in rejects non-string exotic remainder values after an ordinary prefix',
    run() {
      for (const value of [Symbol('remainder'), 1]) {
        const realm = createRealm();
        const remainder = createForInIterator(realm, [value]);
        let enumerateCalls = 0;
        class EnumerateBoundary extends EngineObject {
          enumerate() {
            enumerateCalls += 1;
            return remainder.iterator;
          }
        }

        const boundary = new EnumerateBoundary(
          realm.intrinsics.objectPrototype,
        );
        const source = new EngineObject(boundary);
        source.defineOwnProperty('prefix', {
          value: 1,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        defineGlobal(realm, 'source', source);

        const completion = evaluateScript(realm, 'for (var key in source) {}');
        assertSame(completion.type, 'throw');
        assertSame(
          /** @type {EngineObject} */ (completion.value).get('message'),
          'Enumerate iterator value is not a string',
        );
        assertSame(enumerateCalls, 1);
        assertSame(remainder.state.nextCalls, 1);
      }
    },
  },
  {
    name: 'synchronous for-in bridges a separate target Agent into its evaluating Realm',
    run() {
      const evaluatingAgent = createAgent();
      const targetAgent = createAgent();
      const evaluatingRealm = createRealm({ agent: evaluatingAgent });
      const targetRealm = createRealm({ agent: targetAgent });
      let enumerateCalls = 0;
      /** @type {{ iterator: EngineObject | null }} */
      const captured = { iterator: null };

      class CapturingTarget extends EngineObject {
        enumerate() {
          assertSame(
            targetAgent.activeExecutionRealm,
            evaluatingRealm,
            'separate target Agent must see the evaluating Realm',
          );
          enumerateCalls += 1;
          const iterator = super.enumerate();
          captured.iterator = iterator;
          return iterator;
        }
      }

      const source = new CapturingTarget(
        targetRealm.intrinsics.objectPrototype,
      );
      source.defineOwnProperty('2', {
        value: 2,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      source.defineOwnProperty('1', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      source.defineOwnProperty('text', {
        value: 3,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      source.defineOwnProperty(Symbol('hidden'), {
        value: 4,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(evaluatingRealm, 'source', source);

      assertSame(
        evaluateScript(
          evaluatingRealm,
          'var keys = []; for (var key in source) { keys.push(key); } keys.join(",");',
        ).value,
        '1,2,text',
      );
      assertSame(enumerateCalls, 1);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
      const iterator = captured.iterator;
      if (iterator === null) {
        throw new Error('Expected for-in to retain its iterator');
      }
      assertSame(
        iterator.getPrototypeOf(),
        evaluatingRealm.intrinsics.iteratorPrototype,
      );
      const iteratorMethod = /** @type {any} */ (
        iterator.get(
          evaluatingAgent.wellKnownSymbols.iterator,
          iterator,
          evaluatingRealm,
        )
      );
      assertSame(iteratorMethod.realm, evaluatingRealm);
      assertSame(
        callCallable(iteratorMethod, iterator, [], evaluatingRealm),
        iterator,
      );
      assertSame(
        /** @type {{ realm?: unknown }} */ (iterator.get('next', iterator))
          .realm,
        evaluatingRealm,
      );
      const result = /** @type {EngineObject} */ (
        /** @type {any} */ (iterator.get('next', iterator)).callFunction(
          iterator,
          [],
          evaluatingRealm,
        )
      );
      assertSame(
        result.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );

      class AbruptTarget extends EngineObject {
        /** @returns {EngineObject} */
        enumerate() {
          assertSame(
            targetAgent.activeExecutionRealm,
            evaluatingRealm,
            'abrupt dispatch must still install the evaluating Realm',
          );
          throw new GuestErrorSignal('TypeError', 'enumerate abrupt');
        }
      }

      defineGlobal(
        evaluatingRealm,
        'abruptSource',
        new AbruptTarget(targetRealm.intrinsics.objectPrototype),
      );
      const abrupt = evaluateScript(
        evaluatingRealm,
        'for (var key in abruptSource) {}',
      );
      assertSame(abrupt.type, 'throw');
      assertSame(
        /** @type {EngineObject} */ (abrupt.value).get('message'),
        'enumerate abrupt',
      );
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
    },
  },
  {
    name: 'synchronous for-in bridges a separately owned ordinary Enumerate boundary into its evaluating Realm',
    run() {
      const evaluatingAgent = createAgent();
      const targetAgent = createAgent();
      const boundaryAgent = createAgent();
      const evaluatingRealm = createRealm({ agent: evaluatingAgent });
      const targetRealm = createRealm({ agent: targetAgent });
      const boundaryRealm = createRealm({ agent: boundaryAgent });
      let enumerateCalls = 0;
      /** @type {{ iterator: EngineObject | null }} */
      const captured = { iterator: null };

      class DelegatingBoundary extends EngineObject {
        enumerate() {
          assertSame(
            boundaryAgent.activeExecutionRealm,
            evaluatingRealm,
            'separate boundary Agent must see the evaluating Realm',
          );
          enumerateCalls += 1;
          const iterator = super.enumerate();
          captured.iterator = iterator;
          return iterator;
        }
      }

      const boundary = new DelegatingBoundary(
        boundaryRealm.intrinsics.objectPrototype,
      );
      boundary.defineOwnProperty('boundary', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const source = new EngineObject(targetRealm.intrinsics.objectPrototype);
      source.defineOwnProperty('target', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(source.agent, targetAgent);
      assertSame(boundary.agent, boundaryAgent);
      assertSame(source.setPrototypeOf(boundary), true);
      defineGlobal(evaluatingRealm, 'source', source);

      assertSame(
        evaluateScript(
          evaluatingRealm,
          'var keys = []; for (var key in source) { keys.push(key); } keys.join(",");',
        ).value,
        'target,boundary',
      );
      assertSame(enumerateCalls, 1);
      assertSame(evaluatingAgent.activeExecutionRealm, null);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(boundaryAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._synchronousCallChain, null);
      assertSame(targetAgent._synchronousCallChain, null);
      assertSame(boundaryAgent._synchronousCallChain, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
      assertSame(boundaryAgent._generatorHostChain, null);

      const iterator = captured.iterator;
      if (iterator === null) {
        throw new Error('Expected boundary Enumerate to retain its iterator');
      }
      assertSame(
        iterator.getPrototypeOf(),
        evaluatingRealm.intrinsics.iteratorPrototype,
      );
      const next = /** @type {any} */ (iterator.get('next', iterator));
      assertSame(next.realm, evaluatingRealm);
      const result = /** @type {EngineObject} */ (
        next.callFunction(iterator, [], evaluatingRealm)
      );
      assertSame(
        result.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );

      let abruptEnumerateCalls = 0;
      /** @type {{ iterator: EngineObject | null }} */
      const abruptCaptured = { iterator: null };
      class AbruptDelegatingBoundary extends EngineObject {
        /** @returns {EngineObject} */
        enumerate() {
          assertSame(
            boundaryAgent.activeExecutionRealm,
            evaluatingRealm,
            'abrupt boundary dispatch must see the evaluating Realm',
          );
          abruptEnumerateCalls += 1;
          const iterator = super.enumerate();
          abruptCaptured.iterator = iterator;
          throw new GuestErrorSignal('TypeError', 'boundary enumerate abrupt');
        }
      }

      const abruptBoundary = new AbruptDelegatingBoundary(
        boundaryRealm.intrinsics.objectPrototype,
      );
      const abruptSource = new EngineObject(
        targetRealm.intrinsics.objectPrototype,
      );
      assertSame(abruptSource.setPrototypeOf(abruptBoundary), true);
      defineGlobal(evaluatingRealm, 'abruptSource', abruptSource);

      const abrupt = evaluateScript(
        evaluatingRealm,
        'for (var key in abruptSource) {}',
      );
      assertSame(abrupt.type, 'throw');
      assertSame(
        /** @type {EngineObject} */ (abrupt.value).get('message'),
        'boundary enumerate abrupt',
      );
      assertSame(abruptEnumerateCalls, 1);
      assertSame(evaluatingAgent.activeExecutionRealm, null);
      assertSame(targetAgent.activeExecutionRealm, null);
      assertSame(boundaryAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent._synchronousCallChain, null);
      assertSame(targetAgent._synchronousCallChain, null);
      assertSame(boundaryAgent._synchronousCallChain, null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(targetAgent._generatorHostChain, null);
      assertSame(boundaryAgent._generatorHostChain, null);

      const abruptIterator = abruptCaptured.iterator;
      if (abruptIterator === null) {
        throw new Error(
          'Expected abrupt boundary Enumerate to allocate an iterator',
        );
      }
      assertSame(
        abruptIterator.getPrototypeOf(),
        evaluatingRealm.intrinsics.iteratorPrototype,
      );
      const abruptNext = /** @type {any} */ (
        abruptIterator.get('next', abruptIterator)
      );
      assertSame(abruptNext.realm, evaluatingRealm);
      const abruptResult = /** @type {EngineObject} */ (
        abruptNext.callFunction(abruptIterator, [], evaluatingRealm)
      );
      assertSame(
        abruptResult.getPrototypeOf(),
        evaluatingRealm.intrinsics.objectPrototype,
      );
    },
  },
  {
    name: 'for-in supports an assignable left-hand side and break/continue/return propagation',
    run() {
      const realm = createRealm();

      // Bare identifier (not a `var` declarator) as the loop target.
      assertSame(
        evaluateScript(
          realm,
          'var k; var keys = []; for (k in { x: 1, y: 2 }) { keys.push(k); } keys.join(",");',
        ).value,
        'x,y',
      );

      // Member-expression left-hand side.
      assertSame(
        evaluateScript(
          realm,
          'var bag = {}; for (bag.last in { p: 1, q: 2 }) {} bag.last;',
        ).value,
        'q',
      );

      // `break` stops enumeration early.
      assertSame(
        evaluateScript(
          realm,
          'var keys = []; for (var k in { a: 1, b: 2, c: 3 }) { ' +
            'if (k === "b") { break; } keys.push(k); } keys.join(",");',
        ).value,
        'a',
      );

      // `continue` skips the rest of the body for that key only.
      assertSame(
        evaluateScript(
          realm,
          'var keys = []; for (var k in { a: 1, b: 2, c: 3 }) { ' +
            'if (k === "b") { continue; } keys.push(k); } keys.join(",");',
        ).value,
        'a,c',
      );

      // `return` from inside a function body escapes the for-in loop.
      assertSame(
        evaluateScript(
          realm,
          'function first(obj) { for (var k in obj) { return k; } return null; } ' +
            'first({ only: 1 });',
        ).value,
        'only',
      );

      // A thrown guest error escapes the loop as a `throw` completion
      // (not a host exception — guest throws are values, per `api.js`).
      const thrown = evaluateScript(
        realm,
        'for (var k in { a: 1 }) { throw new TypeError("boom"); }',
      );
      assertSame(thrown.type, 'throw');
      assertSame(/** @type {any} */ (thrown.value).get('message'), 'boom');
    },
  },
  {
    // ECMA-262 12.6.4: "If a property that has not yet been visited during
    // enumeration is deleted, then it will not be visited." The enumeration
    // order is fixed up front, but each name's liveness is re-checked when
    // the loop reaches it.
    name: 'for-in skips properties deleted before enumeration reaches them',
    run() {
      const realm = createRealm();

      // A later own property deleted from the body is never visited.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2, c: 3 }; var keys = []; ' +
            'for (var k in o) { keys.push(k); delete o.c; } keys.join(",");',
        ).value,
        'a,b',
      );

      // Deleting every remaining key stops the loop after the first name.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2, c: 3 }; var keys = []; ' +
            'for (var k in o) { keys.push(k); delete o.b; delete o.c; } keys.join(",");',
        ).value,
        'a',
      );

      // The loop variable is not assigned for a skipped name.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2 }; var k = "untouched"; ' +
            'for (k in o) { delete o.b; } k;',
        ).value,
        'a',
      );

      // An inherited property deleted from the prototype is skipped too.
      assertSame(
        evaluateScript(
          realm,
          'var Base = function () {}; Base.prototype.inherited = 1; ' +
            'var child = new Base(); child.own = 1; var keys = []; ' +
            'for (var k in child) { keys.push(k); delete Base.prototype.inherited; } ' +
            'keys.join(",");',
        ).value,
        'own',
      );

      // Deleting an own property that shadows an *enumerable* inherited one
      // leaves the name live: the inherited property is what the body now
      // sees, and the name is still visited exactly once.
      assertSame(
        evaluateScript(
          realm,
          'var Base = function () {}; Base.prototype.shared = "base"; ' +
            'var child = new Base(); child.first = 1; child.shared = "own"; ' +
            'var keys = []; ' +
            'for (var k in child) { keys.push(k + ":" + child[k]); ' +
            'if (k === "first") { delete child.shared; } } keys.join(",");',
        ).value,
        'first:1,shared:base',
      );

      // Deleting an own property that shadows a *non-enumerable* inherited
      // one removes the name from the enumeration instead. ES5 12.6.4 does
      // not decide this case and real engines disagree (JavaScriptCore
      // answers as below; V8 keeps the name, because its re-check is a bare
      // `HasProperty`); this engine answers with the same shadowing walk it
      // built the snapshot with.
      assertSame(
        evaluateScript(
          realm,
          'var Base = function () {}; ' +
            'Object.defineProperty(Base.prototype, "hidden", ' +
            '{ value: "base", writable: true, enumerable: false, configurable: true }); ' +
            'var child = new Base(); child.first = 1; child.hidden = "own"; ' +
            'var keys = []; ' +
            'for (var k in child) { keys.push(k); ' +
            'if (k === "first") { delete child.hidden; } } keys.join(",");',
        ).value,
        'first',
      );

      // A name made non-enumerable before the loop reaches it is skipped for
      // the same reason (12.6.4 step 6 asks for the next property "whose
      // [[Enumerable]] attribute is true", not the one it was at loop entry).
      // Implementation-defined in the same way as the case above.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2 }; var keys = []; ' +
            'for (var k in o) { keys.push(k); ' +
            'Object.defineProperty(o, "b", { enumerable: false }); } keys.join(",");',
        ).value,
        'a',
      );

      // A property deleted and re-created before it is reached is live again.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2 }; var keys = []; ' +
            'for (var k in o) { keys.push(k); ' +
            'if (k === "a") { delete o.b; o.b = 3; } } keys.join(",");',
        ).value,
        'a,b',
      );

      // Already-visited names are unaffected by a later delete.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2 }; var keys = []; ' +
            'for (var k in o) { delete o.a; keys.push(k); } keys.join(",");',
        ).value,
        'a,b',
      );
    },
  },
  {
    // The other half of 12.6.4: properties added during enumeration "are not
    // guaranteed to be visited"; this engine's snapshot never visits them,
    // which is the stable choice that keeps enumeration finite.
    name: 'for-in additions during enumeration stay outside the snapshot',
    run() {
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1 }; var keys = []; ' +
            'for (var k in o) { keys.push(k); o.added = 2; } keys.join(",");',
        ).value,
        'a',
      );

      // Including a name added to the prototype mid-loop.
      assertSame(
        evaluateScript(
          realm,
          'var Base = function () {}; var child = new Base(); child.own = 1; ' +
            'var keys = []; ' +
            'for (var k in child) { keys.push(k); Base.prototype.late = 1; } ' +
            'keys.join(",");',
        ).value,
        'own',
      );

      // Re-adding a name that was already visited does not visit it twice.
      assertSame(
        evaluateScript(
          realm,
          'var o = { a: 1, b: 2 }; var keys = []; ' +
            'for (var k in o) { keys.push(k); if (k === "a") { delete o.a; o.a = 9; } } ' +
            'keys.join(",");',
        ).value,
        'a,b',
      );
    },
  },
  {
    name: 'debugger statements produce an empty (undefined) completion value',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, 'debugger;');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, undefined);
    },
  },
  {
    name: 'debugger statements thread completion values through like empty statements',
    run() {
      const realm = createRealm();
      // `debugger;` has an empty completion value, so the block's completion
      // value should remain the last *meaningful* value (1).
      const completion = evaluateScript(realm, '{ 1; debugger; }');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 1);
    },
  },
  {
    name: 'DebuggerStatement is a recognized statement node type',
    run() {
      assertSame(STATEMENT_TYPES.has('DebuggerStatement'), true);
    },
  },
];

export default tests;
