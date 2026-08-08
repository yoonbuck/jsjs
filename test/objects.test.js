import { assertSame, assertThrows } from './harness/assert.js';
import { Reference, getValue, putValue } from '../src/runtime/reference.js';
import {
  completePropertyDescriptor,
  isAccessorDescriptor,
  isDataDescriptor,
  isGenericDescriptor,
  validatePropertyDescriptor,
} from '../src/runtime/descriptors.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';

const tests = [
  {
    name: '_peekOwnDescriptor returns the raw stored descriptor without copying',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('x', {
        value: 42,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const raw = obj._peekOwnDescriptor('x');
      assertSame(raw !== undefined, true);
      assertSame(raw.value, 42);
      // Two calls must return the same object reference (no copy per call).
      assertSame(obj._peekOwnDescriptor('x') === raw, true);
      // Public getOwnProperty must still return a detached copy.
      const pub = obj.getOwnProperty('x');
      assertSame(pub === raw, false);
    },
  },
  {
    name: 'public getOwnProperty is detached: mutating the returned descriptor does not affect stored state',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('x', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const pub = obj.getOwnProperty('x');
      pub.value = 999;
      // The stored value must remain 1.
      assertSame(obj.get('x'), 1);
    },
  },
  {
    name: 'defineOwnProperty with value-only descriptor on writable data property updates in place',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('x', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const before = obj._peekOwnDescriptor('x');
      obj.defineOwnProperty('x', { value: 2 });
      const after = obj._peekOwnDescriptor('x');
      // In-place mutation: the stored descriptor object must be the same reference.
      assertSame(before === after, true);
      assertSame(after.value, 2);
      assertSame(obj.get('x'), 2);
    },
  },
  {
    name: 'prototype mutation is immediately visible through getProperty after _peekOwnDescriptor optimization',
    run() {
      const proto = new EngineObject();
      proto.defineOwnProperty('x', {
        value: 'proto',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const obj = new EngineObject(proto);
      // Must see inherited value before and after proto mutation.
      assertSame(obj.get('x'), 'proto');
      proto.defineOwnProperty('x', { value: 'updated' });
      assertSame(obj.get('x'), 'updated');
    },
  },
  {
    name: 'non-configurable property semantics are preserved through fast-path defineOwnProperty',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('locked', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      // Value change on non-writable non-configurable must be rejected.
      assertSame(obj.defineOwnProperty('locked', { value: 2 }), false);
      assertThrows(
        () => obj.defineOwnProperty('locked', { value: 2 }, true),
        GuestErrorSignal,
      );
      // Same-value is allowed.
      assertSame(obj.defineOwnProperty('locked', { value: 1 }), true);
      assertSame(obj.get('locked'), 1);
    },
  },
  {
    name: 'descriptor helpers classify descriptors and reject mixed accessors',
    run() {
      const dataDescriptor = completePropertyDescriptor({ value: 1 });
      const accessorDescriptor = completePropertyDescriptor({
        get() {
          return 1;
        },
      });

      assertSame(isDataDescriptor(dataDescriptor), true);
      assertSame(isAccessorDescriptor(dataDescriptor), false);
      assertSame(isGenericDescriptor(dataDescriptor), false);
      assertSame(dataDescriptor.writable, false);
      assertSame(dataDescriptor.enumerable, false);
      assertSame(dataDescriptor.configurable, false);
      assertSame(isAccessorDescriptor(accessorDescriptor), true);
      assertSame(isDataDescriptor(accessorDescriptor), false);
      assertSame(accessorDescriptor.set, undefined);
      assertThrows(
        () =>
          validatePropertyDescriptor({
            value: 1,
            get() {
              return 1;
            },
          }),
        TypeError,
      );
    },
  },
  {
    name: 'engine objects provide the property-reference protocol',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty(
        'count',
        {
          value: 2,
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      const reference = new Reference(object, 'count', true);

      assertSame(getValue(reference), 2);
      assertSame(putValue(reference, 3), 3);
      assertSame(object.get('count'), 3);
    },
  },
  {
    name: 'engine objects preserve insertion order and walk their prototype chain',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty(
        'shared',
        {
          value: 'proto',
          writable: true,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      const object = new EngineObject(prototype);
      object.defineOwnProperty(
        'first',
        { value: 1, writable: true, enumerable: true, configurable: true },
        true,
      );
      object.defineOwnProperty(
        'second',
        { value: 2, writable: true, enumerable: true, configurable: true },
        true,
      );

      assertSame(
        JSON.stringify(object.ownPropertyKeys()),
        '["first","second"]',
      );
      assertSame(object.get('shared'), 'proto');
      assertSame(object.hasProperty('shared'), true);
    },
  },
  {
    name: 'non-configurable data properties reject incompatible changes',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty(
        'locked',
        {
          value: 1,
          writable: false,
          enumerable: true,
          configurable: false,
        },
        true,
      );

      assertSame(
        object.defineOwnProperty('locked', { writable: false }, true),
        true,
      );
      assertThrows(
        () => object.defineOwnProperty('locked', { configurable: true }, true),
        GuestErrorSignal,
      );
      assertThrows(
        () => object.defineOwnProperty('locked', { value: 2 }, true),
        GuestErrorSignal,
      );
      assertSame(object.delete('locked'), false);
      assertThrows(() => object.delete('locked', true), GuestErrorSignal);
    },
  },
  {
    name: 'non-configurable properties reject enumerable changes',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty(
        'locked',
        {
          value: 1,
          writable: true,
          enumerable: true,
          configurable: false,
        },
        true,
      );

      assertSame(
        object.defineOwnProperty('locked', { enumerable: false }),
        false,
      );
      assertThrows(
        () => object.defineOwnProperty('locked', { enumerable: false }, true),
        GuestErrorSignal,
      );
      const descriptor = object.getOwnProperty('locked');
      if (descriptor === undefined) {
        throw new Error('Expected locked descriptor');
      }
      assertSame(descriptor.enumerable, true);
    },
  },
  {
    name: 'put respects inherited writability and inherited setters',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty(
        'readOnly',
        {
          value: 1,
          writable: false,
          enumerable: true,
          configurable: true,
        },
        true,
      );
      let setterValue = 'unset';
      prototype.defineOwnProperty(
        'sink',
        {
          set(value) {
            setterValue = String(value);
          },
          enumerable: true,
          configurable: true,
        },
        true,
      );
      const object = new EngineObject(prototype);

      assertSame(object.put('readOnly', 2), false);
      assertSame(object.getOwnProperty('readOnly'), undefined);
      assertThrows(() => object.put('readOnly', 2, true), GuestErrorSignal);
      assertSame(object.put('sink', 7, true), true);
      assertSame(setterValue, '7');
      assertSame(object.getOwnProperty('sink'), undefined);
    },
  },
  {
    name: 'put invokes own accessors and rejects getter-only assignments',
    run() {
      let setterValue = 'unset';
      const object = new EngineObject();
      object.defineOwnProperty(
        'sink',
        {
          set(value) {
            setterValue = String(value);
          },
          enumerable: true,
          configurable: true,
        },
        true,
      );
      object.defineOwnProperty(
        'getterOnly',
        {
          get() {
            return 1;
          },
          enumerable: true,
          configurable: true,
        },
        true,
      );

      assertSame(object.put('sink', 9, true), true);
      assertSame(setterValue, '9');
      assertSame(isAccessorDescriptor(object.getOwnProperty('sink')), true);
      assertSame(object.put('getterOnly', 2), false);
      assertThrows(() => object.put('getterOnly', 2, true), GuestErrorSignal);
    },
  },
];

export default tests;
