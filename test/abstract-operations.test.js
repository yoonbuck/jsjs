import { assertSame, assertThrows } from './harness/assert.js';
import {
  checkObjectCoercible,
  toNumber,
  toPrimitive,
  toString,
} from '../src/runtime/conversion.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import {
  abstractEqualityComparison,
  abstractRelationalComparison,
  add,
  divide,
  multiply,
  remainder,
  strictEqualityComparison,
  subtract,
} from '../src/runtime/operators.js';

const tests = [
  {
    name: 'toPrimitive honors preferred types and rejects non-primitive results',
    run() {
      /** @type {string[]} */
      const trace = [];
      const object = new EngineObject();
      object.defineOwnProperty(
        'toString',
        {
          value() {
            trace.push('toString');
            return 'guest';
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      object.defineOwnProperty(
        'valueOf',
        {
          value() {
            trace.push('valueOf');
            return 3;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );

      assertSame(toPrimitive(object, 'string'), 'guest');
      assertSame(toPrimitive(object, 'number'), 3);
      assertSame(JSON.stringify(trace), '["toString","valueOf"]');

      const invalid = new EngineObject();
      invalid.defineOwnProperty(
        'toString',
        {
          value() {
            return invalid;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      invalid.defineOwnProperty(
        'valueOf',
        {
          value() {
            return invalid;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );

      assertThrows(() => toPrimitive(invalid), GuestErrorSignal);
    },
  },
  {
    name: 'conversion operations cover NaN signed zero and nullish coercion',
    run() {
      assertSame(toNumber(undefined), NaN);
      assertSame(toNumber(null), 0);
      assertSame(Object.is(toNumber('-0'), -0), true);
      assertSame(toNumber(' 0x10 '), 16);
      assertSame(Number.isNaN(toNumber('0b101')), true);
      assertSame(Number.isNaN(toNumber('0o17')), true);
      assertSame(Number.isNaN(toNumber('1_0')), true);
      assertSame(toString(-0), '0');
      assertSame(toString(true), 'true');
      assertThrows(() => checkObjectCoercible(null), TypeError);
      assertThrows(() => checkObjectCoercible(undefined), TypeError);
      assertSame(checkObjectCoercible('ready'), 'ready');
    },
  },
  {
    name: 'string toNumber accepts exactly the ES5 StringNumericLiteral grammar',
    run() {
      const whitespace =
        '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u180e\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

      assertSame(toNumber(whitespace), 0);
      assertSame(toNumber(`${whitespace}+Infinity${whitespace}`), Infinity);
      assertSame(toNumber('-Infinity'), -Infinity);
      assertSame(toNumber('+12.5e-1'), 1.25);
      assertSame(toNumber('.5'), 0.5);
      assertSame(toNumber('1.'), 1);
      assertSame(Object.is(toNumber('-0'), -0), true);
      assertSame(toNumber('0x10'), 16);
      assertSame(toNumber('0XfF'), 255);
      assertSame(toNumber('+0x10'), NaN);
      assertSame(toNumber('-0x10'), NaN);
      assertSame(toNumber('infinity'), NaN);
      assertSame(toNumber('1e'), NaN);
      assertSame(toNumber('.'), NaN);
    },
  },
  {
    name: 'toPrimitive rejects host wrappers arrays and plain objects',
    run() {
      assertThrows(() => toPrimitive(new Number(1)), TypeError);
      assertThrows(() => toPrimitive([]), TypeError);
      assertThrows(() => toPrimitive({}), TypeError);
    },
  },
  {
    name: 'equality operations follow strict and abstract comparison rules',
    run() {
      const numericObject = new EngineObject();
      numericObject.defineOwnProperty(
        'valueOf',
        {
          value() {
            return 5;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );

      assertSame(strictEqualityComparison(0, -0), true);
      assertSame(strictEqualityComparison(NaN, NaN), false);
      assertSame(abstractEqualityComparison(null, undefined), true);
      assertSame(abstractEqualityComparison('5', 5), true);
      assertSame(abstractEqualityComparison(false, 0), true);
      assertSame(abstractEqualityComparison(numericObject, 5), true);
      assertSame(abstractEqualityComparison(NaN, NaN), false);
    },
  },
  {
    name: 'arithmetic operators use primitive coercion rules',
    run() {
      const stringObject = new EngineObject();
      stringObject.defineOwnProperty(
        'toString',
        {
          value() {
            return 'prefix';
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );

      assertSame(add('x', 1), 'x1');
      assertSame(add(stringObject, '!'), 'prefix!');
      assertSame(subtract('5', 2), 3);
      assertSame(multiply('6', '7'), 42);
      assertSame(Object.is(divide(-1, Infinity), -0), true);
      assertSame(remainder(5, 2), 1);
      assertSame(add(NaN, 1), NaN);
    },
  },
  {
    name: 'abstract relational comparison preserves left-first coercion order',
    run() {
      /** @type {string[]} */
      const trace = [];
      const left = new EngineObject();
      left.defineOwnProperty(
        'valueOf',
        {
          value() {
            trace.push('left');
            return 2;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      const right = new EngineObject();
      right.defineOwnProperty(
        'valueOf',
        {
          value() {
            trace.push('right');
            return 3;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );

      assertSame(abstractRelationalComparison(left, right, true), true);
      assertSame(JSON.stringify(trace), '["left","right"]');
    },
  },
  {
    name: 'abstract relational comparison preserves right-first coercion order',
    run() {
      /** @type {string[]} */
      const trace = [];
      const left = new EngineObject();
      left.defineOwnProperty(
        'valueOf',
        {
          value() {
            trace.push('left');
            return 2;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      const right = new EngineObject();
      right.defineOwnProperty(
        'valueOf',
        {
          value() {
            trace.push('right');
            return 3;
          },
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );

      trace.length = 0;
      assertSame(abstractRelationalComparison(left, right, false), true);
      assertSame(JSON.stringify(trace), '["right","left"]');
    },
  },
  {
    name: 'abstract relational comparison handles NaN and string comparison',
    run() {
      assertSame(abstractRelationalComparison(NaN, 1), undefined);
      assertSame(abstractRelationalComparison('20', '3'), true);
    },
  },
];

export default tests;
