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
  // ── Behavioral: getProperty returns a detached descriptor (Finding 1) ──────
  {
    name: 'getProperty returns a detached copy: mutating it does not affect future reads',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('x', {
        value: 'original',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const desc = obj.getProperty('x');
      assertSame(desc !== undefined, true);
      if (desc === undefined) {
        throw new Error('expected descriptor');
      }
      assertSame(desc.value, 'original');
      // Mutating the returned descriptor must not affect stored state.
      desc.value = 'mutated';
      assertSame(obj.get('x'), 'original');
    },
  },
  {
    name: 'getProperty on inherited property returns detached copy: mutating it does not affect prototype',
    run() {
      const proto = new EngineObject();
      proto.defineOwnProperty('y', {
        value: 'proto-val',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const child = new EngineObject(proto);
      const desc = child.getProperty('y');
      assertSame(desc !== undefined, true);
      if (desc === undefined) {
        throw new Error('expected descriptor');
      }
      assertSame(desc.value, 'proto-val');
      desc.value = 'hacked';
      // Proto and child reads must still return original value.
      assertSame(proto.get('y'), 'proto-val');
      assertSame(child.get('y'), 'proto-val');
    },
  },
  // ── Behavioral: defineOwnProperty validates descriptor type (Finding 2) ────
  {
    name: 'defineOwnProperty with null descriptor on existing property throws TypeError from validation (not in-operator)',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('x', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      // null is not a valid descriptor — must throw TypeError from validatePropertyDescriptor
      // with the message "Property descriptor must be an object", not a host TypeError
      // from the 'in' operator ("Cannot use 'in' operator to search for 'value' in null").
      const err = assertThrows(
        () => obj.defineOwnProperty('x', /** @type {any} */ (null)),
        TypeError,
      );
      assertSame(err.message, 'Property descriptor must be an object');
    },
  },
  {
    name: 'defineOwnProperty with non-object descriptor on new property throws validation TypeError',
    run() {
      const obj = new EngineObject();
      const nullErr = assertThrows(
        () => obj.defineOwnProperty('x', /** @type {any} */ (null)),
        TypeError,
      );
      assertSame(nullErr.message, 'Property descriptor must be an object');
      const numErr = assertThrows(
        () => obj.defineOwnProperty('x', /** @type {any} */ (42)),
        TypeError,
      );
      assertSame(numErr.message, 'Property descriptor must be an object');
    },
  },
  // ── Behavioral: observable write/reject semantics (replaces implementation tests) ──
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
      if (pub === undefined) {
        throw new Error('expected descriptor');
      }
      pub.value = 999;
      // The stored value must remain 1.
      assertSame(obj.get('x'), 1);
    },
  },
  {
    name: 'fast-path defineOwnProperty updates value on writable property',
    run() {
      const obj = new EngineObject();
      obj.defineOwnProperty('x', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const result = obj.defineOwnProperty('x', { value: 2 });
      assertSame(result, true);
      assertSame(obj.get('x'), 2);
      // Other descriptor fields must be preserved.
      const d = obj.getOwnProperty('x');
      if (d === undefined) {
        throw new Error('expected descriptor');
      }
      assertSame(d.writable, true);
      assertSame(d.enumerable, true);
      assertSame(d.configurable, true);
    },
  },
  {
    name: 'prototype mutation is immediately visible through get after fast-path optimization',
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
  // ── Behavioral: receiver-aware ordinary Set (ES2015 [[Set]] boundary) ─────
  {
    name: 'set on an inherited writable data property creates an own receiver property without mutating the prototype',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject(prototype);
      assertSame(prototype.set('value', 2, receiver), true);
      assertSame(prototype.get('value'), 1);
      assertSame(receiver.get('value'), 2);
      const own = receiver.getOwnProperty('value');
      if (own === undefined) {
        throw new Error('Expected receiver to gain an own property');
      }
      assertSame(own.value, 2);
      assertSame(own.writable, true);
    },
  },
  {
    name: 'set on an inherited non-writable data property rejects in sloppy and strict modes',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('locked', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject(prototype);
      assertSame(prototype.set('locked', 2, receiver), false);
      assertSame(receiver.getOwnProperty('locked'), undefined);
      assertThrows(
        () => prototype.set('locked', 2, receiver, true),
        GuestErrorSignal,
      );
      assertSame(receiver.getOwnProperty('locked'), undefined);
    },
  },
  {
    name: 'set on an inherited setter invokes it with the original receiver',
    run() {
      let observedReceiver = null;
      let observedValue = 'unset';
      const prototype = new EngineObject();
      prototype.defineOwnProperty('sink', {
        set(value) {
          observedReceiver = this;
          observedValue = String(value);
        },
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject(prototype);
      assertSame(prototype.set('sink', 5, receiver, true), true);
      assertSame(observedReceiver, receiver);
      assertSame(observedValue, '5');
      assertSame(receiver.getOwnProperty('sink'), undefined);
    },
  },
  {
    name: 'set respects a receiver own writable data property distinct from the found prototype descriptor',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject();
      receiver.defineOwnProperty('value', {
        value: 'receiver-original',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(prototype.set('value', 'updated', receiver), true);
      assertSame(receiver.get('value'), 'updated');
      assertSame(prototype.get('value'), 1);
    },
  },
  {
    name: 'set rejects when the receiver own data property is non-writable',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject();
      receiver.defineOwnProperty('value', {
        value: 'frozen',
        writable: false,
        enumerable: true,
        configurable: true,
      });
      assertSame(prototype.set('value', 'updated', receiver), false);
      assertSame(receiver.get('value'), 'frozen');
      assertThrows(
        () => prototype.set('value', 'updated', receiver, true),
        GuestErrorSignal,
      );
      assertSame(receiver.get('value'), 'frozen');
    },
  },
  {
    name: 'set rejects when the receiver has its own accessor property for a name found as a prototype data property',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      let getterCalls = 0;
      const receiver = new EngineObject();
      receiver.defineOwnProperty('value', {
        get() {
          getterCalls += 1;
          return 'receiver-accessor';
        },
        enumerable: true,
        configurable: true,
      });
      assertSame(prototype.set('value', 'updated', receiver), false);
      assertSame(receiver.get('value'), 'receiver-accessor');
      assertSame(getterCalls, 1);
    },
  },
  {
    name: 'put delegates to set with itself as the receiver',
    run() {
      let setterValue = 'unset';
      let observedReceiver = null;
      const object = new EngineObject();
      object.defineOwnProperty('sink', {
        set(value) {
          observedReceiver = this;
          setterValue = String(value);
        },
        enumerable: true,
        configurable: true,
      });
      assertSame(object.put('sink', 3, true), true);
      assertSame(setterValue, '3');
      assertSame(observedReceiver, object);
    },
  },
];

export default tests;
