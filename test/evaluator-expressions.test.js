import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

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
    name: 'numeric, string, boolean, and null literals evaluate to themselves',
    run() {
      assertSame(run('42;'), 42);
      assertSame(run('"hi";'), 'hi');
      assertSame(run("'hi';"), 'hi');
      assertSame(run('true;'), true);
      assertSame(run('false;'), false);
      assertSame(run('null;'), null);
    },
  },
  {
    name: 'identifiers read the value bound to a declared variable',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 10;');

      const completion = evaluateScript(realm, 'x;');
      assertSame(completion.value, 10);
    },
  },
  {
    name: 'reading an undeclared identifier throws a ReferenceError',
    run() {
      const realm = createRealm();
      assertThrows(() => evaluateScript(realm, 'undeclared;'), ReferenceError);
    },
  },
  {
    name: 'assignment expressions assign and evaluate to the assigned value',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x;');

      const completion = evaluateScript(realm, 'x = 5;');
      assertSame(completion.value, 5);
      assertSame(realm.globalObject.get('x'), 5);
    },
  },
  {
    name: 'assignment right-hand sides can reference the left-hand variable',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 1;');
      evaluateScript(realm, 'x = x + 1;');

      assertSame(realm.globalObject.get('x'), 2);
    },
  },
  {
    name: 'typeof reports guest primitive types and undefined for unresolved identifiers',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'var n = 1; var s = "a"; var b = true; var nul = null; var u;',
      );

      assertSame(evaluateScript(realm, 'typeof n;').value, 'number');
      assertSame(evaluateScript(realm, 'typeof s;').value, 'string');
      assertSame(evaluateScript(realm, 'typeof b;').value, 'boolean');
      assertSame(evaluateScript(realm, 'typeof nul;').value, 'object');
      assertSame(evaluateScript(realm, 'typeof u;').value, 'undefined');
      assertSame(
        evaluateScript(realm, 'typeof neverDeclared;').value,
        'undefined',
      );
    },
  },
  {
    name: 'void always evaluates to undefined and still evaluates its operand',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x;');

      assertSame(evaluateScript(realm, 'void (x = 1);').value, undefined);
      assertSame(realm.globalObject.get('x'), 1);
    },
  },
  {
    name: 'unary !, -, and + apply boolean negation and numeric coercion',
    run() {
      assertSame(run('!true;'), false);
      assertSame(run('!0;'), true);
      assertSame(run('!"";'), true);
      assertSame(run('-5;'), -5);
      assertSame(run('-"3";'), -3);
      assertSame(run('+"3";'), 3);
      assertSame(run('+true;'), 1);
    },
  },
  {
    name: 'binary arithmetic operators follow abstract numeric/string coercion',
    run() {
      assertSame(run('1 + 2;'), 3);
      assertSame(run('"a" + "b";'), 'ab');
      assertSame(run('"a" + 1;'), 'a1');
      assertSame(run('5 - 2;'), 3);
      assertSame(run('3 * 4;'), 12);
      assertSame(run('10 / 4;'), 2.5);
      assertSame(run('10 % 3;'), 1);
    },
  },
  {
    name: 'binary equality operators distinguish strict and abstract comparison',
    run() {
      assertSame(run('1 == "1";'), true);
      assertSame(run('1 === "1";'), false);
      assertSame(run('1 != "1";'), false);
      assertSame(run('1 !== "1";'), true);
      assertSame(run('null == undefined;'), true);
      assertSame(run('null === undefined;'), false);
    },
  },
  {
    name: 'binary relational operators compare numbers and strings',
    run() {
      assertSame(run('1 < 2;'), true);
      assertSame(run('2 <= 2;'), true);
      assertSame(run('3 > 2;'), true);
      assertSame(run('2 >= 3;'), false);
      assertSame(run('"a" < "b";'), true);
      assertSame(run('NaN < 1;'), false);
      assertSame(run('1 > NaN;'), false);
    },
  },
  {
    name: 'logical && and || short-circuit without evaluating the right operand',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 0;');
      evaluateScript(realm, 'false && (x = 1);');
      assertSame(realm.globalObject.get('x'), 0);

      evaluateScript(realm, 'true || (x = 2);');
      assertSame(realm.globalObject.get('x'), 0);

      assertSame(run('1 && 2;'), 2);
      assertSame(run('0 || 3;'), 3);
      assertSame(run('null && 1;'), null);
    },
  },
  {
    name: 'the conditional operator evaluates only the taken branch',
    run() {
      assertSame(run('true ? 1 : 2;'), 1);
      assertSame(run('false ? 1 : 2;'), 2);

      const realm = createRealm();
      evaluateScript(realm, 'var x = 0;');
      evaluateScript(realm, 'true ? 1 : (x = 9);');
      assertSame(realm.globalObject.get('x'), 0);
    },
  },
  {
    name: 'unsupported unary operators (bitwise not, delete) throw explicitly',
    run() {
      const bitwiseNot = assertThrows(() => run('~1;'), Error);
      assertSame(bitwiseNot.name, 'UnsupportedOperatorError');
      assertSame(/** @type {any} */ (bitwiseNot).operator, '~');

      const del = assertThrows(() => run('delete x;'), Error);
      assertSame(del.name, 'UnsupportedOperatorError');
      assertSame(/** @type {any} */ (del).operator, 'delete');
    },
  },
  {
    name: 'unsupported binary operators (bitwise, instanceof, in) throw explicitly',
    run() {
      for (const [source, operator] of [
        ['1 & 1;', '&'],
        ['1 | 1;', '|'],
        ['1 ^ 1;', '^'],
        ['1 << 1;', '<<'],
        ['1 >> 1;', '>>'],
        ['1 >>> 1;', '>>>'],
        ['1 instanceof Object;', 'instanceof'],
        ['"a" in {};', 'in'],
      ]) {
        const error = assertThrows(() => run(source), Error);
        assertSame(error.name, 'UnsupportedOperatorError');
        assertSame(/** @type {any} */ (error).operator, operator);
      }
    },
  },
  {
    name: 'compound assignment operators throw an explicit unsupported-operator error',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 1;');

      const error = assertThrows(() => evaluateScript(realm, 'x += 1;'), Error);
      assertSame(error.name, 'UnsupportedOperatorError');
      assertSame(/** @type {any} */ (error).operator, '+=');
    },
  },
  {
    name: 'update expressions (++/--) are not supported yet and throw explicitly',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 1;');

      const error = assertThrows(() => evaluateScript(realm, 'x++;'), Error);
      assertSame(error.name, 'UnsupportedNodeError');
      assertSame(/** @type {any} */ (error).nodeType, 'UpdateExpression');
    },
  },
  {
    name: 'assigning to a member expression throws an explicit unsupported-node error',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x;');

      const error = assertThrows(
        () => evaluateScript(realm, 'x.y = 1;'),
        Error,
      );
      assertSame(error.name, 'UnsupportedNodeError');
      assertSame(/** @type {any} */ (error).nodeType, 'MemberExpression');
    },
  },
  {
    name: 'regex literals are not supported yet and throw explicitly',
    run() {
      const error = assertThrows(() => run('/ab/i;'), Error);
      assertSame(error.name, 'UnsupportedNodeError');
      assertSame(/** @type {any} */ (error).nodeType, 'RegExpLiteral');
    },
  },
  {
    name: 'object literals, array literals, calls, new, and function expressions are unsupported (Task 6)',
    run() {
      const cases = [
        ['({a: 1});', 'ObjectExpression'],
        ['[1, 2];', 'ArrayExpression'],
        ['f();', 'CallExpression'],
        ['new Foo();', 'NewExpression'],
        ['(function () {});', 'FunctionExpression'],
        ['(1, 2);', 'SequenceExpression'],
      ];

      for (const [source, nodeType] of cases) {
        const error = assertThrows(() => run(source), Error);
        assertSame(error.name, 'UnsupportedNodeError');
        assertSame(/** @type {any} */ (error).nodeType, nodeType);
      }
    },
  },
];

export default tests;
