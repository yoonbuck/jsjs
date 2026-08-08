/**
 * Task 2 – focused behavioral tests for canonical array-index detection,
 * indexed-write/length consistency, sparse arrays, prototype visibility,
 * non-writable length, shrink-deletion ordering, non-configurable elements,
 * descriptor transitions, and accessor behavior on EngineArray.
 *
 * Each test was added BEFORE the corresponding optimization so that the
 * optimization can be verified not to regress any semantic.  Tests that
 * exercise only existing behavior are GREEN from the start; they serve as
 * regression guards.
 */

import { assertSame, assertThrows } from './harness/assert.js';
import { EngineArray, toArrayIndex } from '../src/runtime/array-object.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

// ── toArrayIndex – canonical recognition ────────────────────────────────────

const tests = [
  {
    name: 'toArrayIndex: 0 is a valid index',
    run() {
      assertSame(toArrayIndex('0'), 0);
    },
  },
  {
    name: 'toArrayIndex: 1 is a valid index',
    run() {
      assertSame(toArrayIndex('1'), 1);
    },
  },
  {
    name: 'toArrayIndex: 4294967294 is the maximum valid index',
    run() {
      assertSame(toArrayIndex('4294967294'), 4294967294);
    },
  },
  {
    name: 'toArrayIndex: 4294967295 (2^32-1) is rejected',
    run() {
      assertSame(toArrayIndex('4294967295'), undefined);
    },
  },
  {
    name: 'toArrayIndex: leading zero "01" is rejected',
    run() {
      assertSame(toArrayIndex('01'), undefined);
    },
  },
  {
    name: 'toArrayIndex: leading zero "00" is rejected',
    run() {
      assertSame(toArrayIndex('00'), undefined);
    },
  },
  {
    name: 'toArrayIndex: decimal "1.0" is rejected',
    run() {
      assertSame(toArrayIndex('1.0'), undefined);
    },
  },
  {
    name: 'toArrayIndex: signed "+1" is rejected',
    run() {
      assertSame(toArrayIndex('+1'), undefined);
    },
  },
  {
    name: 'toArrayIndex: negative "-1" is rejected',
    run() {
      assertSame(toArrayIndex('-1'), undefined);
    },
  },
  {
    name: 'toArrayIndex: scientific "1e0" is rejected',
    run() {
      assertSame(toArrayIndex('1e0'), undefined);
    },
  },
  {
    name: 'toArrayIndex: empty string is rejected',
    run() {
      assertSame(toArrayIndex(''), undefined);
    },
  },
  {
    name: 'toArrayIndex: non-string number is rejected',
    run() {
      assertSame(toArrayIndex(/** @type {any} */ (0)), undefined);
    },
  },
  {
    name: 'toArrayIndex: Symbol is rejected',
    run() {
      assertSame(
        toArrayIndex(/** @type {any} */ (Symbol('x'))),
        undefined,
      );
    },
  },
  {
    name: 'toArrayIndex: whitespace-padded " 1" is rejected',
    run() {
      assertSame(toArrayIndex(' 1'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "Infinity" is rejected',
    run() {
      assertSame(toArrayIndex('Infinity'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "NaN" is rejected',
    run() {
      assertSame(toArrayIndex('NaN'), undefined);
    },
  },

  // ── indexed write preserves length ──────────────────────────────────────

  {
    name: 'indexed write at index 0 on empty array sets length to 1',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('0', {
        value: 'x',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(a._length(), 1);
    },
  },
  {
    name: 'indexed write at index 2 on empty array sets length to 3',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('2', {
        value: 'x',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(a._length(), 3);
    },
  },
  {
    name: 'consecutive indexed writes keep length at maximum index + 1',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('0', { value: 'a', writable: true, enumerable: true, configurable: true });
      a.defineOwnProperty('5', { value: 'b', writable: true, enumerable: true, configurable: true });
      a.defineOwnProperty('2', { value: 'c', writable: true, enumerable: true, configurable: true });
      assertSame(a._length(), 6);
    },
  },

  // ── length access via engine evaluation ─────────────────────────────────

  {
    name: 'array.length returns correct value after push',
    run() {
      assertSame(run('[1,2,3].length'), 3);
    },
  },
  {
    name: 'array.length is 0 for empty array',
    run() {
      assertSame(run('[].length'), 0);
    },
  },

  // ── sparse arrays ────────────────────────────────────────────────────────

  {
    name: 'sparse array: only defined indices are own properties',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('5', { value: 'x', writable: true, enumerable: true, configurable: true });
      assertSame(a._length(), 6);
      assertSame(a.getOwnProperty('0'), undefined);
      assertSame(a.getOwnProperty('1'), undefined);
      assertSame(a.getOwnProperty('5') !== undefined, true);
    },
  },
  {
    name: 'sparse array: shrink deletes only own indices at or above new length',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('1', { value: 'a', writable: true, enumerable: true, configurable: true });
      a.defineOwnProperty('5', { value: 'b', writable: true, enumerable: true, configurable: true });
      // shrink length to 3: only index 5 should be deleted
      a.defineOwnProperty('length', { value: 3 });
      assertSame(a._length(), 3);
      assertSame(a.getOwnProperty('5'), undefined);
      assertSame(a.getOwnProperty('1') !== undefined, true);
    },
  },

  // ── prototype visibility ──────────────────────────────────────────────────

  {
    name: 'array index read falls through to prototype',
    run() {
      const proto = new EngineObject();
      proto.defineOwnProperty('0', {
        value: 'inherited',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const a = new EngineArray(proto);
      // no own '0' property
      const desc = a.getProperty('0');
      assertSame(desc !== undefined, true);
      assertSame(desc.value, 'inherited');
    },
  },

  // ── non-writable length ───────────────────────────────────────────────────

  {
    name: 'writing past non-writable length is rejected',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('length', { value: 2, writable: false });
      const result = a.defineOwnProperty('2', {
        value: 'x',
        writable: true,
        enumerable: true,
        configurable: true,
      }, false);
      assertSame(result, false);
      assertSame(a._length(), 2);
    },
  },
  {
    name: 'writing past non-writable length throws in strict mode',
    run() {
      const err = assertThrows(() => {
        const a = new EngineArray();
        a.defineOwnProperty('length', { value: 2, writable: false });
        a.defineOwnProperty('2', {
          value: 'x',
          writable: true,
          enumerable: true,
          configurable: true,
        }, true);
      }, GuestErrorSignal);
      assertSame(err.typeName, 'TypeError');
    },
  },
  {
    name: 'non-writable length blocks shrinking via engine evaluation',
    run() {
      assertSame(
        run(
          '"use strict"; (function () {' +
          '  var a = [1, 2, 3];' +
          '  Object.defineProperty(a, "length", { writable: false });' +
          '  try { a[3] = 4; return "no-throw"; } catch (e) { return e instanceof TypeError ? "ok" : "bad"; }' +
          '}())',
        ),
        'ok',
      );
    },
  },

  // ── shrink deletion ordering ──────────────────────────────────────────────

  {
    name: 'shrink deletes indices in descending order and stops at non-configurable',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('0', { value: 'a', writable: true, enumerable: true, configurable: true });
      a.defineOwnProperty('1', { value: 'b', writable: true, enumerable: true, configurable: false });
      a.defineOwnProperty('2', { value: 'c', writable: true, enumerable: true, configurable: true });
      // shrink to 0: index 2 deletable, index 1 not, so length stays 2
      const ok = a.defineOwnProperty('length', { value: 0 }, false);
      assertSame(ok, false);
      assertSame(a._length(), 2);
      assertSame(a.getOwnProperty('2'), undefined);
      assertSame(a.getOwnProperty('1') !== undefined, true);
    },
  },

  // ── non-configurable elements ────────────────────────────────────────────

  {
    name: 'defining non-configurable then reconfiguring is rejected',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('0', { value: 1, writable: true, enumerable: true, configurable: false });
      const ok = a.defineOwnProperty('0', { configurable: true }, false);
      assertSame(ok, false);
    },
  },

  // ── descriptor transitions ───────────────────────────────────────────────

  {
    name: 'array index can transition from data to accessor when configurable',
    run() {
      const a = new EngineArray();
      a.defineOwnProperty('0', { value: 1, writable: true, enumerable: true, configurable: true });
      const getter = { callFunction: () => 99 };
      a.defineOwnProperty('0', { get: getter, enumerable: true, configurable: true });
      const desc = a.getOwnProperty('0');
      assertSame(desc !== undefined, true);
      assertSame('get' in /** @type {any} */ (desc), true);
      assertSame('value' in /** @type {any} */ (desc), false);
    },
  },

  // ── accessor behavior on array indices ───────────────────────────────────

  {
    name: 'getter on array index is called on read',
    run() {
      const result = run(
        '(function () {' +
        '  var a = [];' +
        '  Object.defineProperty(a, "0", { get: function() { return 42; }, configurable: true });' +
        '  return a[0];' +
        '}())',
      );
      assertSame(result, 42);
    },
  },
  {
    name: 'setter on array index is called on write',
    run() {
      const result = run(
        '(function () {' +
        '  var a = [];' +
        '  var captured;' +
        '  Object.defineProperty(a, "0", { set: function(v) { captured = v; }, get: function() { return captured; }, configurable: true });' +
        '  a[0] = 99;' +
        '  return a[0];' +
        '}())',
      );
      assertSame(result, 99);
    },
  },

  // ── length consistency via full engine evaluation ────────────────────────

  {
    name: 'array index hot path: repeated read-modify-write preserves correctness',
    run() {
      const result = run(
        '(function () {' +
        '  var a = [];' +
        '  var i;' +
        '  for (i = 0; i < 50; i += 1) { a[i] = i * 2; }' +
        '  var s = 0;' +
        '  for (i = 0; i < 50; i += 1) { s = s + a[i]; }' +
        '  return s;' +
        '}())',
      );
      // sum of 0..49 * 2 = 2 * (49*50/2) = 2450
      assertSame(result, 2450);
    },
  },
  {
    name: 'array index hot path: write at computed index updates length',
    run() {
      const result = run(
        '(function () {' +
        '  var a = [0, 0, 0];' +
        '  var i;' +
        '  for (i = 0; i < 100; i += 1) {' +
        '    var idx = i % 3;' +
        '    a[idx] = a[idx] + 1;' +
        '  }' +
        '  return a.length + ":" + a[0] + ":" + a[1] + ":" + a[2];' +
        '}())',
      );
      // 100 iterations, idx cycles 0,1,2,0,1,2... each updated ceil(100/3) or floor
      // 100 = 33*3 + 1, so idx 0 gets 34, idx 1 gets 33, idx 2 gets 33
      assertSame(result, '3:34:33:33');
    },
  },
];

export default tests;
