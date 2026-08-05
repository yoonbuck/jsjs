import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { evaluate } from '../src/evaluator/index.js';

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
    name: 'reading an undeclared identifier produces a guest ReferenceError',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'undeclared;');
      assertSame(result.type, 'throw');
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
    name: 'assigning to an undeclared identifier creates a property on the realm global object',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, 'created = 5; created;');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 5);
      assertSame(realm.globalObject.get('created'), 5);
      assertSame(realm.globalEnvironment.hasBinding('created'), true);
    },
  },
  {
    name: 'an implicitly created global carries the same attributes as an ordinary global assignment, not var semantics',
    run() {
      const realm = createRealm();
      evaluateScript(
        realm,
        'implicit = 1; this.explicit = 1; var declared = 1;',
      );

      const implicit = realm.globalObject.getOwnProperty('implicit');
      const explicit = realm.globalObject.getOwnProperty('explicit');
      const declared = realm.globalObject.getOwnProperty('declared');

      assertSame(implicit === undefined, false, 'implicit global was created');
      assertSame(
        JSON.stringify(implicit),
        JSON.stringify(explicit),
        'an implicit global matches an ordinary [[Put]] on the global object',
      );
      assertSame(/** @type {any} */ (implicit).writable, true);
      assertSame(/** @type {any} */ (implicit).enumerable, true);
      assertSame(/** @type {any} */ (implicit).configurable, true);
      assertSame(
        /** @type {any} */ (declared).configurable,
        false,
        'a var-declared global stays non-configurable',
      );
    },
  },
  {
    name: 'an implicitly created global is read and updated by later scripts instead of being recreated',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'counter = 1;');
      evaluateScript(realm, 'counter = counter + 2;');

      assertSame(evaluateScript(realm, 'counter;').value, 3);
      assertSame(
        realm.globalObject.ownPropertyKeys().filter((key) => key === 'counter')
          .length,
        1,
      );
    },
  },
  {
    name: 'a function body assigning an undeclared name creates the global through the whole scope chain',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'function f() { fromFunction = 7; } f(); fromFunction;',
      );

      assertSame(completion.value, 7);
      assertSame(realm.globalObject.get('fromFunction'), 7);
    },
  },
  {
    name: 'implicitly created globals stay inside their realm and never reach host globals',
    run() {
      const first = createRealm();
      const second = createRealm();
      evaluateScript(first, 'isolated = 5;');

      assertSame(first.globalObject.get('isolated'), 5);
      assertSame(second.globalObject.hasProperty('isolated'), false);
      assertSame(evaluateScript(second, 'typeof isolated;').value, 'undefined');
      assertSame(evaluateScript(second, 'isolated;').type, 'throw');
      assertSame(
        Object.prototype.hasOwnProperty.call(globalThis, 'isolated'),
        false,
      );
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
    name: 'guest numeric coercion follows ES5 StringNumericLiteral syntax',
    run() {
      assertSame(run('+"\\u00a0+12.5e1\\ufeff";'), 125);
      assertSame(run('+"Infinity";'), Infinity);
      assertSame(run('+"0x10";'), 16);
      assertSame(run('+"0b101";'), NaN);
      assertSame(run('+"0o17";'), NaN);
      assertSame(run('+"1_0";'), NaN);
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
    name: 'unsupported binary operators (instanceof, in) throw explicitly',
    run() {
      for (const [source, operator] of [
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
    name: 'bitwise binary operators are now supported',
    run() {
      assertSame(run('1 & 3;'), 1);
      assertSame(run('1 | 2;'), 3);
      assertSame(run('3 ^ 1;'), 2);
      assertSame(run('1 << 2;'), 4);
      assertSame(run('8 >> 1;'), 4);
      assertSame(run('1 >>> 0;'), 1);
    },
  },
  {
    name: 'compound assignment operators are now supported',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 1;');
      assertSame(evaluateScript(realm, 'x += 2;').value, 3);
    },
  },
  {
    name: 'update expressions (++/--) are now supported',
    run() {
      const realm = createRealm();
      evaluateScript(realm, 'var x = 1;');
      assertSame(evaluateScript(realm, 'x++;').value, 1);
      assertSame(evaluateScript(realm, 'x;').value, 2);
    },
  },
  {
    name: 'assigning to anything other than an identifier or member expression throws an explicit unsupported-node error',
    run() {
      // An ES5 parser rejects every other assignment target itself, so the
      // evaluator's guard is exercised with a synthetic node.
      const realm = createRealm();
      const context = {
        realm,
        env: realm.globalEnvironment,
        strict: false,
        thisValue: realm.globalObject,
      };

      const error = assertThrows(
        () =>
          evaluate(
            {
              type: 'AssignmentExpression',
              operator: '=',
              left: { type: 'ArrayPattern', elements: [] },
              right: { type: 'Literal', value: 1 },
            },
            context,
          ),
        Error,
      );
      assertSame(error.name, 'UnsupportedNodeError');
      assertSame(/** @type {any} */ (error).nodeType, 'ArrayPattern');
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
    name: 'object literals, array literals, calls, new, function expressions, and sequences evaluate to values',
    run() {
      assertSame(run('typeof ({a: 1});'), 'object');
      assertSame(run('[1, 2].length;'), 2);
      assertSame(run('function f() { return 1; } f();'), 1);
      assertSame(run('function P() { this.a = 2; } new P().a;'), 2);
      assertSame(run('typeof (function () {});'), 'function');
      assertSame(run('(1, 2);'), 2);
    },
  },
];

export default tests;
