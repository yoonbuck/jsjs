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

const tests = [
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
        TypeError,
      );
      assertThrows(
        () => object.defineOwnProperty('locked', { value: 2 }, true),
        TypeError,
      );
      assertSame(object.delete('locked'), false);
      assertThrows(() => object.delete('locked', true), TypeError);
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
      assertThrows(() => object.put('readOnly', 2, true), TypeError);
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
      assertThrows(() => object.put('getterOnly', 2, true), TypeError);
    },
  },
];

export default tests;
