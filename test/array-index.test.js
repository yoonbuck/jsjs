/**
 * Task 2 – focused behavioral tests for `toArrayIndex` canonical semantics.
 *
 * The canonical correctness boundary: a self-contained digit parser must
 * recognise exactly 0..4294967294 as valid array indices, even when
 * `globalThis.Number` is poisoned to throw.  The pre-optimization
 * implementation calls `Number(name)` and therefore fails under poisoning,
 * providing a deterministic RED before the fast-path is introduced.
 *
 * Tests are also included for the canonical edge cases required by the new
 * parser (leading zeros, signs, decimals, exponent, whitespace, type check).
 */

import { assertSame } from './harness/assert.js';
import { toArrayIndex } from '../src/runtime/array-object.js';

// ── host-Number poisoning fixture ────────────────────────────────────────────

/**
 * Replace `globalThis.Number` with a function that always throws, run `fn`,
 * then restore the original binding — even if `fn` throws.
 *
 * @param {() => void} fn
 */
function withPoisonedNumber(fn) {
  const saved = globalThis.Number;
  globalThis.Number = /** @type {any} */ (
    function poisonedNumber() {
      throw new Error('host Number was called');
    }
  );
  try {
    fn();
  } finally {
    globalThis.Number = saved;
  }
}

// ── canonical-semantics tests ────────────────────────────────────────────────

const tests = [
  // --- deterministic RED/GREEN boundary: these fail pre-optimization because
  //     toArrayIndex calls Number(name) which throws when Number is poisoned.
  {
    name: 'toArrayIndex survives poisoned globalThis.Number for single-digit index',
    run() {
      withPoisonedNumber(() => {
        assertSame(toArrayIndex('0'), 0);
        assertSame(toArrayIndex('5'), 5);
        assertSame(toArrayIndex('9'), 9);
      });
    },
  },
  {
    name: 'toArrayIndex survives poisoned globalThis.Number for multi-digit index',
    run() {
      withPoisonedNumber(() => {
        assertSame(toArrayIndex('42'), 42);
        assertSame(toArrayIndex('4294967294'), 4294967294);
      });
    },
  },
  {
    name: 'toArrayIndex survives poisoned globalThis.Number for rejected strings',
    run() {
      withPoisonedNumber(() => {
        assertSame(toArrayIndex('4294967295'), undefined);
        assertSame(toArrayIndex('01'), undefined);
        assertSame(toArrayIndex('-1'), undefined);
        assertSame(toArrayIndex(''), undefined);
      });
    },
  },

  // --- canonical edge cases (0..4294967294 accepted; everything else rejected)
  {
    name: 'toArrayIndex: "0" → 0',
    run() {
      assertSame(toArrayIndex('0'), 0);
    },
  },
  {
    name: 'toArrayIndex: "1" → 1',
    run() {
      assertSame(toArrayIndex('1'), 1);
    },
  },
  {
    name: 'toArrayIndex: "4294967294" → 4294967294 (max valid)',
    run() {
      assertSame(toArrayIndex('4294967294'), 4294967294);
    },
  },
  {
    name: 'toArrayIndex: "4294967295" → undefined (2^32-1 rejected)',
    run() {
      assertSame(toArrayIndex('4294967295'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "01" → undefined (leading zero)',
    run() {
      assertSame(toArrayIndex('01'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "00" → undefined (leading zero)',
    run() {
      assertSame(toArrayIndex('00'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "1.0" → undefined (decimal)',
    run() {
      assertSame(toArrayIndex('1.0'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "+1" → undefined (sign)',
    run() {
      assertSame(toArrayIndex('+1'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "-1" → undefined (sign)',
    run() {
      assertSame(toArrayIndex('-1'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "1e0" → undefined (exponent)',
    run() {
      assertSame(toArrayIndex('1e0'), undefined);
    },
  },
  {
    name: 'toArrayIndex: "" → undefined (empty)',
    run() {
      assertSame(toArrayIndex(''), undefined);
    },
  },
  {
    name: 'toArrayIndex: " 1" → undefined (whitespace)',
    run() {
      assertSame(toArrayIndex(' 1'), undefined);
    },
  },
  {
    name: 'toArrayIndex: number 0 → undefined (wrong type)',
    run() {
      assertSame(toArrayIndex(/** @type {any} */ (0)), undefined);
    },
  },
  {
    name: 'toArrayIndex: Symbol → undefined',
    run() {
      assertSame(toArrayIndex(/** @type {any} */ (Symbol('x'))), undefined);
    },
  },
];

export default tests;
