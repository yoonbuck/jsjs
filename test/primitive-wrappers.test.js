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

/**
 * Asserts `source` completes abruptly with a guest error object whose
 * prototype chain includes the same realm's `constructorName.prototype`, so a
 * host `TypeError` leaking out of the engine cannot be mistaken for the
 * specified guest throw.
 *
 * @param {string} source
 * @param {string} constructorName
 * @returns {void}
 */
function assertGuestThrow(source, constructorName) {
  const realm = createRealm();
  const completion = evaluateScript(realm, source);

  assertSame(completion.type, 'throw');

  if (!(completion.value instanceof EngineObject)) {
    throw new Error(
      `Expected a guest error object, got ${typeof completion.value}`,
    );
  }

  const constructor = /** @type {any} */ (
    realm.globalObject.get(constructorName)
  );
  const prototype = /** @type {EngineObject} */ (constructor.get('prototype'));

  for (
    let current = completion.value.getPrototype();
    current !== null;
    current = current.getPrototype()
  ) {
    if (current === prototype) {
      return;
    }
  }

  throw new Error(`Thrown value is not an instance of ${constructorName}`);
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
    // ES5 8.7.2's special [[Put]] for a reference with a primitive base:
    // creating an own property on the transient wrapper is a TypeError in
    // strict code (step 7.a) rather than a write nobody can ever observe.
    name: 'strict assignment through a primitive base throws a guest TypeError',
    run() {
      // Missing property (step 7).
      assertGuestThrow('"use strict"; "x".missing = 1;', 'TypeError');
      assertGuestThrow('"use strict"; (5).missing = 1;', 'TypeError');
      assertGuestThrow('"use strict"; true.missing = 1;', 'TypeError');
      assertGuestThrow(
        '"use strict"; var s = "x"; s.missing = 1;',
        'TypeError',
      );
      assertGuestThrow('"use strict"; "x"["missing"] = 1;', 'TypeError');

      // Own data properties of a String wrapper: `length` and an in-range
      // index are both non-writable, so [[CanPut]] is false (step 2.a).
      assertGuestThrow('"use strict"; "abc".length = 5;', 'TypeError');
      assertGuestThrow('"use strict"; "abc"[0] = "z";', 'TypeError');

      // An out-of-range index is just a missing property (step 7).
      assertGuestThrow('"use strict"; "abc"[9] = "z";', 'TypeError');

      // An inherited *writable data* property still cannot be shadowed on a
      // transient wrapper (step 5 finds a data descriptor, so step 7 throws).
      assertGuestThrow('"use strict"; "x".charAt = 1;', 'TypeError');

      // A getter-only inherited accessor cannot be assigned either (step 2).
      assertGuestThrow(
        '"use strict"; Object.defineProperty(String.prototype, "g", ' +
          '{ get: function () { return 1; } }); "x".g = 2;',
        'TypeError',
      );

      // The throw is an ordinary catchable guest completion, and the failed
      // assignment leaves the prototype untouched.
      assertSame(
        run(
          '"use strict"; var caught; ' +
            'try { "x".charAt = 1; } catch (e) { caught = e; } ' +
            '(caught instanceof TypeError) + ":" + "abc".charAt(1);',
        ),
        'true:b',
      );

      // 11.13.1 evaluates the right-hand side before PutValue, so the
      // TypeError cannot pre-empt the assignment's own side effects.
      assertSame(
        run(
          '"use strict"; var ran = false; ' +
            'try { "x".missing = (ran = true, 1); } catch (e) {} ran;',
        ),
        true,
      );
    },
  },
  {
    // The non-strict half of the same algorithm: every step that throws for a
    // strict reference simply returns, so the assignment is a silent no-op.
    name: 'non-strict assignment through a primitive base is a silent no-op',
    run() {
      assertSame(run('"x".missing = 1; "x".missing;'), undefined);
      assertSame(run('(5).missing = 1; (5).missing;'), undefined);
      assertSame(run('true.missing = 1; true.missing;'), undefined);
      assertSame(run('"abc".length = 5; "abc".length;'), 3);
      assertSame(run('"abc"[0] = "z"; "abc"[0];'), 'a');
      assertSame(run('"x".charAt = 1; typeof "x".charAt;'), 'function');
      assertSame(
        run(
          'Object.defineProperty(String.prototype, "g", ' +
            '{ get: function () { return 1; } }); "x".g = 2; "x".g;',
        ),
        1,
      );

      // The assignment expression still evaluates to its right-hand side.
      assertSame(run('("x".missing = 7);'), 7);
    },
  },
  {
    // Steps 5–6 run for strict and non-strict references alike, and pass
    // `base` — the primitive — as the setter's this value. What the setter
    // then sees is decided by 10.4.3: a strict setter keeps the primitive, a
    // non-strict one boxes it.
    name: 'an inherited setter reached through a primitive base receives the primitive',
    run() {
      assertSame(
        run(
          '"use strict"; var seen; ' +
            'Object.defineProperty(String.prototype, "s", ' +
            '{ set: function (v) { seen = typeof this + ":" + (this === "x") + ":" + v; } }); ' +
            '"x".s = 1; seen;',
        ),
        'string:true:1',
      );
      assertSame(
        run(
          '"use strict"; var seen; ' +
            'Object.defineProperty(Number.prototype, "s", ' +
            '{ set: function (v) { seen = typeof this + ":" + (this === 5); } }); ' +
            '(5).s = 1; seen;',
        ),
        'number:true',
      );
      assertSame(
        run(
          '"use strict"; var seen; ' +
            'Object.defineProperty(Boolean.prototype, "s", ' +
            '{ set: function (v) { seen = typeof this + ":" + (this === true); } }); ' +
            'true.s = 1; seen;',
        ),
        'boolean:true',
      );

      // Non-strict: the setter runs (the no-op steps do not apply here) and
      // 10.4.3 boxes the primitive it was handed.
      assertSame(
        run(
          'var seen; ' +
            'Object.defineProperty(String.prototype, "s", ' +
            '{ set: function (v) { seen = typeof this + ":" + this.valueOf() + ":" + ' +
            '(this instanceof String) + ":" + v; } }); ' +
            '"x".s = 2; seen;',
        ),
        'object:x:true:2',
      );

      // An own setter on a String *wrapper* object is unaffected: its
      // receiver is the wrapper, which is the reference's base already.
      assertSame(
        run(
          '"use strict"; var seen; var boxed = new String("x"); ' +
            'Object.defineProperty(boxed, "s", ' +
            '{ set: function (v) { seen = (this === boxed); } }); ' +
            'boxed.s = 1; seen;',
        ),
        true,
      );
    },
  },
  {
    // 8.7.1's special [[Get]] is the same shape as 8.7.2's special [[Put]]:
    // an accessor found through a primitive base is called with the
    // primitive, not with the transient wrapper.
    name: 'an inherited getter reached through a primitive base receives the primitive',
    run() {
      assertSame(
        run(
          '"use strict"; Object.defineProperty(String.prototype, "g", ' +
            '{ get: function () { return typeof this + ":" + (this === "x"); } }); "x".g;',
        ),
        'string:true',
      );
      assertSame(
        run(
          '"use strict"; Object.defineProperty(Number.prototype, "g", ' +
            '{ get: function () { return typeof this; } }); (5).g;',
        ),
        'number',
      );
      assertSame(
        run(
          'Object.defineProperty(String.prototype, "g", ' +
            '{ get: function () { return typeof this + ":" + this.valueOf(); } }); "x".g;',
        ),
        'object:x',
      );

      // Data properties are unchanged by the accessor path.
      assertSame(run('"abc".length;'), 3);
      assertSame(run('"abc"[2];'), 'c');
      assertSame(run('"x".missing;'), undefined);
      assertSame(
        run(
          'Object.defineProperty(String.prototype, "g", { get: undefined, set: function () {} }); "x".g;',
        ),
        undefined,
      );
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
