import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { parseScript } from '../src/parser.js';
import { evaluate } from '../src/evaluator/index.js';

const tests = [
  {
    name: 'evaluate() dispatches statement nodes to a completion record and expression nodes to a value',
    run() {
      const realm = createRealm();
      const context = { realm, env: realm.globalEnvironment, strict: false };

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
    name: 'break exits the innermost while/do-while/for loop with a normal completion',
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
    name: 'continue skips the remainder of the current iteration only',
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
    name: 'evaluateScript rejects FunctionDeclaration explicitly (Task 6)',
    run() {
      const realm = createRealm();

      const error = assertThrows(
        () => evaluateScript(realm, 'function f() {}'),
        Error,
      );
      assertSame(error.name, 'UnsupportedNodeError');
      assertSame(/** @type {any} */ (error).nodeType, 'FunctionDeclaration');
    },
  },
  {
    name: 'evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly',
    run() {
      const realm = createRealm();

      const forIn = assertThrows(
        () => evaluateScript(realm, 'for (var k in {}) {}'),
        Error,
      );
      assertSame(/** @type {any} */ (forIn).nodeType, 'ForInStatement');

      const switchStatement = assertThrows(
        () => evaluateScript(realm, 'switch (1) { case 1: break; }'),
        Error,
      );
      assertSame(
        /** @type {any} */ (switchStatement).nodeType,
        'SwitchStatement',
      );

      const tryStatement = assertThrows(
        () => evaluateScript(realm, 'try {} catch (e) {}'),
        Error,
      );
      assertSame(/** @type {any} */ (tryStatement).nodeType, 'TryStatement');

      const throwStatement = assertThrows(
        () => evaluateScript(realm, 'throw 1;'),
        Error,
      );
      assertSame(
        /** @type {any} */ (throwStatement).nodeType,
        'ThrowStatement',
      );

      const withStatement = assertThrows(
        () => evaluateScript(realm, 'with ({}) {}'),
        Error,
      );
      assertSame(/** @type {any} */ (withStatement).nodeType, 'WithStatement');

      const labeled = assertThrows(
        () => evaluateScript(realm, 'foo: while (false) { break foo; }'),
        Error,
      );
      assertSame(/** @type {any} */ (labeled).nodeType, 'LabeledStatement');
    },
  },
];

export default tests;
