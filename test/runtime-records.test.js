import { assertSame, assertThrows } from './harness/assert.js';
import {
  createBreakCompletion,
  createContinueCompletion,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
  GuestErrorSignal,
} from '../src/runtime/completion.js';
import {
  Reference,
  UnresolvableReference,
  getValue,
  putValue,
} from '../src/runtime/reference.js';
import { EngineObject } from '../src/runtime/object.js';

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
    name: 'references resolve and assign through EngineObject Get and Set',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty('count', {
        value: 2,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const reference = new Reference(object, 'count', false, object);

      assertSame(getValue(reference), 2);
      putValue(reference, 3);
      assertSame(object.get('count', object), 3);
    },
  },
  {
    name: 'references resolve and assign through environment records',
    run() {
      /** @type {Record<string, number>} */
      const values = { count: 2 };
      const environmentRecord = {
        values,
        /**
         * @param {string} name
         * @returns {number}
         */
        getBindingValue(name) {
          return this.values[name];
        },
        /**
         * @param {string} name
         * @param {number} value
         * @returns {void}
         */
        setMutableBinding(name, value) {
          this.values[name] = value;
        },
      };
      const reference = new Reference(environmentRecord, 'count', true);

      assertSame(getValue(reference), 2);
      putValue(reference, 4);
      assertSame(environmentRecord.values.count, 4);
    },
  },
  {
    name: 'references reject bare host objects as bases',
    run() {
      const reference = new Reference({ count: 2 }, 'count', false);

      assertThrows(() => getValue(reference), TypeError);
      assertThrows(() => putValue(reference, 3), TypeError);
    },
  },
  {
    name: 'unresolvable references throw reference errors',
    run() {
      const reference = new Reference(undefined, 'missing', true);

      assertThrows(() => getValue(reference), GuestErrorSignal);
      assertThrows(() => putValue(reference, 1), GuestErrorSignal);
    },
  },
  {
    name: 'a sloppy unresolvable reference with no engine-owned global object still throws instead of reaching a host global',
    run() {
      const reference = new Reference(undefined, 'missing', false);

      assertThrows(() => getValue(reference), GuestErrorSignal);
      assertThrows(() => putValue(reference, 1), GuestErrorSignal);
    },
  },
  {
    name: 'a sloppy unresolvable reference creates the property on its global object',
    run() {
      const globalObject = new EngineObject();
      const reference = new UnresolvableReference(
        'created',
        false,
        globalObject,
      );

      assertSame(reference.base, undefined);
      assertSame(putValue(reference, 5), 5);
      assertSame(globalObject.get('created', globalObject), 5);
      assertThrows(() => getValue(reference), GuestErrorSignal);
    },
  },
  {
    name: 'a strict unresolvable reference throws even when it carries a global object',
    run() {
      const globalObject = new EngineObject();
      const reference = new UnresolvableReference(
        'created',
        true,
        globalObject,
      );

      assertThrows(() => putValue(reference, 5), GuestErrorSignal);
      assertSame(globalObject.hasProperty('created'), false);
    },
  },
];

export default tests;
