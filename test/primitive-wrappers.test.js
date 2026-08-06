import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import {
  EnginePrimitiveObject,
  createPrimitiveWrapper,
  thisBooleanValue,
  thisNumberValue,
  thisStringValue,
} from '../src/runtime/primitive-object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { toObject } from '../src/runtime/conversion.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

const tests = [
  {
    name: 'wrapper prototypes are per-realm boxed primitives',
    run() {
      const realm = createRealm();
      const { booleanPrototype, numberPrototype, stringPrototype } =
        realm.intrinsics;

      for (const prototype of [
        booleanPrototype,
        numberPrototype,
        stringPrototype,
      ]) {
        assertSame(prototype instanceof EnginePrimitiveObject, true);
        assertSame(
          /** @type {EngineObject} */ (prototype).getPrototype(),
          realm.intrinsics.objectPrototype,
        );
      }

      assertSame(thisBooleanValue(booleanPrototype), false);
      assertSame(thisNumberValue(numberPrototype), 0);
      assertSame(thisStringValue(stringPrototype), '');
      assertSame(
        /** @type {EngineObject} */ (stringPrototype).get('length'),
        0,
      );

      const other = createRealm();

      assertSame(other.intrinsics.stringPrototype === stringPrototype, false);
      assertSame(other.intrinsics.numberPrototype === numberPrototype, false);
      assertSame(other.intrinsics.booleanPrototype === booleanPrototype, false);
    },
  },
  {
    name: 'wrapper prototypes carry their own class tags',
    run() {
      assertSame(
        run(
          'Object.prototype.toString.call(String.prototype) + ":" + ' +
            'Object.prototype.toString.call(Number.prototype) + ":" + ' +
            'Object.prototype.toString.call(Boolean.prototype);',
        ),
        '[object String]:[object Number]:[object Boolean]',
      );
      assertSame(
        run(
          'Object.prototype.toString.call("s") + ":" + ' +
            'Object.prototype.toString.call(1) + ":" + ' +
            'Object.prototype.toString.call(true);',
        ),
        '[object String]:[object Number]:[object Boolean]',
      );
    },
  },
  {
    name: 'ToObject boxes primitives against the realm wrapper prototypes',
    run() {
      const realm = createRealm();

      assertSame(
        toObject(realm, 'text').getPrototype(),
        realm.intrinsics.stringPrototype,
      );
      assertSame(
        toObject(realm, 7).getPrototype(),
        realm.intrinsics.numberPrototype,
      );
      assertSame(
        toObject(realm, false).getPrototype(),
        realm.intrinsics.booleanPrototype,
      );
      assertSame(
        createPrimitiveWrapper(realm, 'text').getClassName(),
        'String',
      );
    },
  },
  {
    name: 'primitive property access autoboxes without materializing a binding',
    run() {
      assertSame(run('"abc".length;'), 3);
      assertSame(run('"abc"[1];'), 'b');
      assertSame(run('"abc".hasOwnProperty("1");'), true);
      assertSame(run('"abc".hasOwnProperty("3");'), false);
      assertSame(run('(5).hasOwnProperty("x");'), false);
      assertSame(run('true.toString();'), 'true');
      assertSame(run('var s = "abc"; s.own = 1; s.own;'), undefined);
    },
  },
  {
    name: 'string wrapper index properties are frozen and enumerable',
    run() {
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Object("hi"), "0"); ' +
            'd.value + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'h:false:true:false',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Object("hi"), "length"); ' +
            'd.value + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        '2:false:false:false',
      );
      assertSame(run('Object.keys(Object("hi")).join(",");'), '0,1');
      assertSame(
        run(
          'var keys = []; for (var k in Object("hi")) { keys.push(k); } keys.join(",");',
        ),
        '0,1',
      );
    },
  },
  {
    name: 'wrapper constructors are non-enumerable writable global bindings',
    run() {
      for (const name of ['Boolean', 'Number', 'String']) {
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(this, "${name}"); ` +
              'd.writable + ":" + d.enumerable + ":" + d.configurable;',
          ),
          'true:false:true',
        );
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(${name}, "prototype"); ` +
              'd.writable + ":" + d.enumerable + ":" + d.configurable;',
          ),
          'false:false:false',
        );
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(${name}.prototype, "constructor"); ` +
              `(d.value === ${name}) + ":" + d.writable + ":" + d.enumerable + ":" + d.configurable;`,
          ),
          'true:true:false:true',
        );
      }
    },
  },
  {
    name: 'wrapper identity is realm-local',
    run() {
      const first = createRealm();
      const second = createRealm();

      evaluateScript(first, 'var boxed = new String("x");');

      const boxed = first.globalObject.get('boxed');

      second.globalObject.defineOwnProperty('foreign', {
        value: boxed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(second, 'foreign instanceof String;').value,
        false,
      );
      assertSame(
        evaluateScript(second, 'String.prototype.valueOf.call(foreign);').value,
        'x',
      );
    },
  },
  {
    name: 'primitive-value helpers accept primitives and matching wrappers only',
    run() {
      const realm = createRealm();

      assertSame(thisStringValue('a'), 'a');
      assertSame(thisStringValue(createPrimitiveWrapper(realm, 'a')), 'a');
      assertSame(thisNumberValue(1.5), 1.5);
      assertSame(thisNumberValue(createPrimitiveWrapper(realm, 1.5)), 1.5);
      assertSame(thisBooleanValue(true), true);
      assertSame(thisBooleanValue(createPrimitiveWrapper(realm, true)), true);

      assertThrows(() => thisStringValue(1), GuestErrorSignal);
      assertThrows(
        () => thisNumberValue(createPrimitiveWrapper(realm, 'a')),
        GuestErrorSignal,
      );
      assertThrows(
        () =>
          thisBooleanValue(new EngineObject(realm.intrinsics.objectPrototype)),
        GuestErrorSignal,
      );
      assertThrows(() => thisNumberValue(undefined), GuestErrorSignal);
    },
  },
];

export default tests;
