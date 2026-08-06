import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { parseScript } from '../src/parser.js';
import { evaluate } from '../src/evaluator/index.js';
import { STATEMENT_TYPES } from '../src/evaluator/statements.js';
import { EXPRESSION_TYPES } from '../src/evaluator/expressions.js';

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
        strict: false,
        thisValue: realm.globalObject,
      };

      for (const type of ['WithStatement', 'NotANode']) {
        const error = assertThrows(
          () => evaluate({ type, body: null }, context),
          Error,
        );
        assertSame(error.name, 'UnsupportedNodeError');
        assertSame(/** @type {any} */ (error).nodeType, type);
      }
    },
  },
  {
    name: 'evaluate() dispatches statement nodes to a completion record and expression nodes to a value',
    run() {
      const realm = createRealm();
      const context = {
        realm,
        env: realm.globalEnvironment,
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
    name: 'evaluateScript rejects with statements explicitly',
    run() {
      const realm = createRealm();

      const withStatement = assertThrows(
        () => evaluateScript(realm, 'with ({}) {}'),
        Error,
      );
      assertSame(/** @type {any} */ (withStatement).nodeType, 'WithStatement');
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
];

export default tests;
