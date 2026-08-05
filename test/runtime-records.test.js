import { assertSame, assertThrows } from './harness/assert.js';
import {
  createBreakCompletion,
  createContinueCompletion,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
} from '../src/runtime/completion.js';
import { Reference, getValue, putValue } from '../src/runtime/reference.js';

const tests = [
  {
    name: 'completion factories create explicit records',
    run() {
      const normal = createNormalCompletion('ready');
      const breakCompletion = createBreakCompletion('loop', 'done');
      const continueCompletion = createContinueCompletion('loop');
      const returnCompletion = createReturnCompletion(7);
      const throwCompletion = createThrowCompletion(new TypeError('boom'));

      assertSame(normal.type, 'normal');
      assertSame(normal.value, 'ready');
      assertSame(breakCompletion.type, 'break');
      assertSame(breakCompletion.target, 'loop');
      assertSame(breakCompletion.value, 'done');
      assertSame(continueCompletion.type, 'continue');
      assertSame(continueCompletion.target, 'loop');
      assertSame(continueCompletion.value, undefined);
      assertSame(returnCompletion.type, 'return');
      assertSame(returnCompletion.value, 7);
      assertSame(throwCompletion.type, 'throw');
      assertSame(/** @type {any} */ (throwCompletion.value).name, 'TypeError');
    },
  },
  {
    name: 'references resolve and assign through getValue and putValue',
    run() {
      const target = { count: 2 };
      const reference = new Reference(target, 'count', false);

      assertSame(getValue(reference), 2);
      putValue(reference, 3);
      assertSame(target.count, 3);
    },
  },
  {
    name: 'unresolvable references throw reference errors',
    run() {
      const reference = new Reference(undefined, 'missing', true);

      assertThrows(() => getValue(reference), ReferenceError);
      assertThrows(() => putValue(reference, 1), ReferenceError);
    },
  },
];

export default tests;
