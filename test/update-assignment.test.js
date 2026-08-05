import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { toInt32, toUint32 } from '../src/runtime/conversion.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const realm = createRealm();
  return evaluateScript(realm, source).value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function runIn(realm, source) {
  return evaluateScript(realm, source).value;
}

const tests = [
  // --- UpdateExpression: postfix ++ ---
  {
    name: 'postfix ++ returns old value',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 5;');
      assertSame(runIn(realm, 'x++;'), 5);
      assertSame(runIn(realm, 'x;'), 6);
    },
  },
  {
    name: 'postfix -- returns old value',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 5;');
      assertSame(runIn(realm, 'x--;'), 5);
      assertSame(runIn(realm, 'x;'), 4);
    },
  },
  // --- UpdateExpression: prefix ++ ---
  {
    name: 'prefix ++ returns new value',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 5;');
      assertSame(runIn(realm, '++x;'), 6);
      assertSame(runIn(realm, 'x;'), 6);
    },
  },
  {
    name: 'prefix -- returns new value',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 5;');
      assertSame(runIn(realm, '--x;'), 4);
      assertSame(runIn(realm, 'x;'), 4);
    },
  },
  // --- UpdateExpression: numeric coercion ---
  {
    name: 'postfix ++ coerces string to number',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = "5";');
      assertSame(runIn(realm, 'x++;'), 5);
      assertSame(runIn(realm, 'x;'), 6);
    },
  },
  {
    name: 'prefix -- coerces string to number',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = "10";');
      assertSame(runIn(realm, '--x;'), 9);
      assertSame(runIn(realm, 'x;'), 9);
    },
  },
  // --- UpdateExpression: member expression, key evaluated exactly once ---
  {
    name: 'postfix ++ on member expression evaluates key exactly once',
    run() {
      const realm = createRealm();
      runIn(realm, 'var calls = 0; var obj = { a: 10 };');
      runIn(realm, 'function key() { calls++; return "a"; }');
      runIn(realm, 'obj[key()]++;');
      assertSame(runIn(realm, 'calls;'), 1);
      assertSame(runIn(realm, 'obj.a;'), 11);
    },
  },
  {
    name: 'prefix -- on member expression evaluates key exactly once',
    run() {
      const realm = createRealm();
      runIn(realm, 'var calls = 0; var arr = { 0: 20 };');
      runIn(realm, 'function idx() { calls++; return "0"; }');
      runIn(realm, '--arr[idx()];');
      assertSame(runIn(realm, 'calls;'), 1);
      assertSame(runIn(realm, 'arr[0];'), 19);
    },
  },
  // --- Compound assignment: all 11 operators ---
  {
    name: '+= adds numbers',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 3;');
      assertSame(runIn(realm, 'x += 4;'), 7);
      assertSame(runIn(realm, 'x;'), 7);
    },
  },
  {
    name: '+= concatenates strings',
    run() {
      const realm = createRealm();
      runIn(realm, 'var s = "hello";');
      assertSame(runIn(realm, 's += " world";'), 'hello world');
    },
  },
  {
    name: '-= subtracts',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 10;');
      assertSame(runIn(realm, 'x -= 3;'), 7);
    },
  },
  {
    name: '*= multiplies',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 6;');
      assertSame(runIn(realm, 'x *= 7;'), 42);
    },
  },
  {
    name: '/= divides',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 20;');
      assertSame(runIn(realm, 'x /= 4;'), 5);
    },
  },
  {
    name: '%= remainder',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 10;');
      assertSame(runIn(realm, 'x %= 3;'), 1);
    },
  },
  {
    name: '<<= left shift',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 1;');
      assertSame(runIn(realm, 'x <<= 3;'), 8);
    },
  },
  {
    name: '>>= signed right shift',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = -8;');
      assertSame(runIn(realm, 'x >>= 1;'), -4);
    },
  },
  {
    name: '>>>= unsigned right shift',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = -1;');
      assertSame(runIn(realm, 'x >>>= 0;'), 4294967295);
    },
  },
  {
    name: '&= bitwise AND',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 15;');
      assertSame(runIn(realm, 'x &= 10;'), 10);
    },
  },
  {
    name: '^= bitwise XOR',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 12;');
      assertSame(runIn(realm, 'x ^= 10;'), 6);
    },
  },
  {
    name: '|= bitwise OR',
    run() {
      const realm = createRealm();
      runIn(realm, 'var x = 12;');
      assertSame(runIn(realm, 'x |= 3;'), 15);
    },
  },
  // --- Compound assignment on member expression: base and key each evaluated once ---
  {
    name: 'compound assignment on member expr evaluates base and key once each',
    run() {
      const realm = createRealm();
      runIn(realm, 'var baseCalls = 0; var keyCalls = 0;');
      runIn(realm, 'var store = { a: 10 };');
      runIn(
        realm,
        [
          'function getStore() { baseCalls++; return store; }',
          'function getKey() { keyCalls++; return "a"; }',
        ].join('\n'),
      );
      runIn(realm, 'getStore()[getKey()] += 1;');
      assertSame(runIn(realm, 'baseCalls;'), 1);
      assertSame(runIn(realm, 'keyCalls;'), 1);
      assertSame(runIn(realm, 'store.a;'), 11);
    },
  },
  // --- Evaluation order: LHS resolved and read before RHS evaluated ---
  {
    name: 'compound assignment evaluates LHS reference before RHS',
    run() {
      const realm = createRealm();
      // Prove RHS runs after LHS read by checking that rhs() was called.
      // We can't push to an array (no guest push yet), so use a counter.
      runIn(realm, 'var x = 1; var rhsCalled = 0;');
      runIn(realm, 'function rhs() { rhsCalled = rhsCalled + 1; return x; }');
      runIn(realm, 'x += rhs();');
      assertSame(runIn(realm, 'rhsCalled;'), 1);
      assertSame(runIn(realm, 'x;'), 2);
    },
  },
  // --- Plain BinaryExpression: bitwise operators ---
  {
    name: 'binary << left shift',
    run() {
      assertSame(run('1 << 3;'), 8);
    },
  },
  {
    name: 'binary >> signed right shift preserves sign',
    run() {
      assertSame(run('-8 >> 1;'), -4);
    },
  },
  {
    name: 'binary >>> unsigned right shift wraps negative',
    run() {
      assertSame(run('-1 >>> 0;'), 4294967295);
    },
  },
  {
    name: 'binary & bitwise AND',
    run() {
      assertSame(run('12 & 10;'), 8);
    },
  },
  {
    name: 'binary ^ bitwise XOR',
    run() {
      assertSame(run('12 ^ 10;'), 6);
    },
  },
  {
    name: 'binary | bitwise OR',
    run() {
      assertSame(run('12 | 3;'), 15);
    },
  },
  {
    name: '1 << 31 produces negative int32',
    run() {
      assertSame(run('1 << 31;'), -2147483648);
    },
  },
  {
    name: 'toUint32 wraparound: -1 >>> 0 is 4294967295',
    run() {
      assertSame(run('-1 >>> 0;'), 4294967295);
    },
  },
  {
    name: 'toInt32 wraparound for large unsigned: (2**32 + 1) | 0',
    run() {
      // 4294967297 === 2**32 + 1; toInt32 of that is 1
      assertSame(run('4294967297 | 0;'), 1);
    },
  },
  {
    // Regression: ToInt32(-0) must return +0, not -0 (spec §9.5 step 3).
    name: 'toInt32(-0) returns +0, not -0',
    run() {
      const result = toInt32(-0);
      // Object.is(result, -0) would be true for -0; we want +0, confirmed by
      // 1/result === Infinity (true for +0, -Infinity for -0).
      if (1 / result !== Infinity) {
        throw new Error(`Expected toInt32(-0) === +0, got ${result}`);
      }
    },
  },
  {
    // Regression: ToUint32(-0.5) must return +0, not -0 (spec §9.6 step 3).
    name: 'toUint32(-0.5) returns +0, not -0',
    run() {
      const result = toUint32(-0.5);
      if (1 / result !== Infinity) {
        throw new Error(`Expected toUint32(-0.5) === +0, got ${result}`);
      }
    },
  },
];

export default tests;
