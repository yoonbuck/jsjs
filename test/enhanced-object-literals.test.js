import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const result = evaluateScript(createRealm(), source);

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return result.value;
}

/**
 * @param {string} source
 * @param {string} name
 * @returns {{ realm: any, value: any, evaluate: (source: string) => unknown }}
 */
function globalOfRealm(source, name) {
  const realm = createRealm();
  const result = evaluateScript(realm, source);

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return {
    realm,
    value: realm.globalObject.get(name),
    evaluate: (nextSource) => evaluateScript(realm, nextSource).value,
  };
}

const tests = [
  {
    name: 'object literals define shorthand and computed data properties',
    run() {
      assertSame(
        run(
          'var value = 2; var key = "computed"; ' +
            'var object = { value, [key]: value + 1 }; ' +
            'object.value + object.computed;',
        ),
        5,
      );
    },
  },
  {
    name: 'computed data property keys evaluate once before values in source order',
    run() {
      assertSame(
        run(
          'var calls = 0; var order = ""; ' +
            'function key(name) { calls = calls + 1; order = order + "k" + name; return name; } ' +
            'function value(name) { order = order + "v" + name; return name; } ' +
            'var object = { [key("a")]: value("A"), [key("b")]: value("B") }; ' +
            'order + ":" + calls + ":" + object.a + object.b;',
        ),
        'kavAkbvB:2:AB',
      );
    },
  },
  {
    name: 'computed keys infer anonymous function names for strings and Symbols',
    run() {
      assertSame(
        run(
          'var key = "computed"; var symbol = Symbol("slot"); ' +
            'var object = { [key]: function () {}, [symbol]: function () {} }; ' +
            'object.computed.name + "," + object[symbol].name;',
        ),
        'computed,[slot]',
      );
    },
  },
  {
    name: 'computed Symbol names distinguish missing and empty descriptions',
    run() {
      assertSame(
        run(
          'var missing = Symbol(); var empty = Symbol(""); ' +
            'var getter = Symbol(); var setter = Symbol(); ' +
            'var object = { ' +
            '[missing]: function () {}, [empty]: function () {}, ' +
            'get [getter]() {}, set [setter](value) {} ' +
            '}; ' +
            'object[missing].name + "|" + object[empty].name + "|" + ' +
            'Object.getOwnPropertyDescriptor(object, getter).get.name + "|" + ' +
            'Object.getOwnPropertyDescriptor(object, setter).set.name;',
        ),
        '|[]|get |set ',
      );
    },
  },
  {
    name: 'concise methods use function parameter semantics and are non-constructible',
    run() {
      const object = globalOfRealm(
        'var object = { method(value = 2, ...rest) { return value + rest.length; } };',
        'object',
      );
      const method = object.value.get('method');

      assertSame(object.evaluate('object.method();'), 2);
      assertSame(object.evaluate('object.method(3, 4, 5);'), 5);
      assertSame(method.get('name'), 'method');
      assertSame(method.get('length'), 0);
      assertSame(method.getOwnProperty('prototype'), undefined);
      assertSame(method._isConstructor, false);
      assertSame(
        object.evaluate(
          'var error; try { new object.method(); } catch (caught) { error = caught.name; } error;',
        ),
        'TypeError',
      );

      const descriptor = object.value.getOwnProperty('method');
      assertSame(descriptor.value, method);
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, true);
    },
  },
  {
    name: 'computed methods and accessors use Symbol names and paired descriptors',
    run() {
      const object = globalOfRealm(
        'var methodKey = Symbol("method"); var getterKey = Symbol("getter"); ' +
          'var setterKey = Symbol("setter"); ' +
          'var object = { ' +
          '[methodKey]() { return this.value; }, ' +
          'get [getterKey]() { return this.value; }, ' +
          'set [setterKey](value) { this.value = value; } ' +
          '};',
        'object',
      );
      const methodKey = object.realm.globalObject.get('methodKey');
      const getterKey = object.realm.globalObject.get('getterKey');
      const setterKey = object.realm.globalObject.get('setterKey');
      const method = object.value.get(methodKey);
      const getter = object.value.getOwnProperty(getterKey).get;
      const setter = object.value.getOwnProperty(setterKey).set;

      assertSame(method.get('name'), '[method]');
      assertSame(getter.get('name'), 'get [getter]');
      assertSame(setter.get('name'), 'set [setter]');
      assertSame(method.getOwnProperty('prototype'), undefined);
      assertSame(getter.getOwnProperty('prototype'), undefined);
      assertSame(setter.getOwnProperty('prototype'), undefined);
      assertSame(method._isConstructor, false);
      assertSame(getter._isConstructor, false);
      assertSame(setter._isConstructor, false);

      const getterDescriptor = object.value.getOwnProperty(getterKey);
      const setterDescriptor = object.value.getOwnProperty(setterKey);
      assertSame(getterDescriptor.get, getter);
      assertSame(getterDescriptor.set, undefined);
      assertSame(setterDescriptor.get, undefined);
      assertSame(setterDescriptor.set, setter);
      assertSame(getterDescriptor.enumerable, true);
      assertSame(getterDescriptor.configurable, true);
      assertSame(setterDescriptor.enumerable, true);
      assertSame(setterDescriptor.configurable, true);
      assertSame(
        object.evaluate(
          'object[setterKey] = 9; object[methodKey]() + object[getterKey];',
        ),
        18,
      );
    },
  },
  {
    name: 'getter and setter definitions pair before later properties overwrite them',
    run() {
      const object = globalOfRealm(
        'var key = "value"; var object = { ' +
          'get [key]() { return this.stored; }, ' +
          'set [key](next) { this.stored = next; } ' +
          '};',
        'object',
      );
      const descriptor = object.value.getOwnProperty('value');

      assertSame(typeof descriptor.get, 'object');
      assertSame(typeof descriptor.set, 'object');
      assertSame(object.evaluate('object.value = 6; object.value;'), 6);
      assertSame(
        run(
          'var object = { value: 1, get value() { return 2; }, ' +
            'set value(next) {}, value: 4 }; ' +
            'var descriptor = Object.getOwnPropertyDescriptor(object, "value"); ' +
            'descriptor.value + ":" + typeof descriptor.get + ":" + typeof descriptor.set;',
        ),
        '4:undefined:undefined',
      );
    },
  },
  {
    name: 'concise methods resolve super through their home object with the call receiver',
    run() {
      assertSame(
        run(
          'var proto = { get value() { return this.tag; } }; ' +
            'var object = { tag: "object", method(suffix) { return super.value + suffix; } }; ' +
            'Object.setPrototypeOf(object, proto); ' +
            'var child = Object.create(object); child.tag = "child"; child.method("!");',
        ),
        'child!',
      );
    },
  },
  {
    name: 'only a static colon __proto__ property mutates an object literal prototype',
    run() {
      assertSame(
        run(
          'var proto = { inherited: 1 }; ' +
            'var changed = { __proto__: proto }; ' +
            'var computed = { ["__proto__"]: proto }; ' +
            'var method = { __proto__() { return 2; } }; ' +
            'var primitive = { __proto__: 1 }; ' +
            'var nullPrototype = { __proto__: null }; ' +
            'changed.inherited + "," + ' +
            '(Object.getPrototypeOf(computed) === Object.prototype) + "," + ' +
            '(computed["__proto__"] === proto) + "," + method.__proto__() + "," + ' +
            'Object.prototype.hasOwnProperty.call(primitive, "__proto__") + "," + ' +
            '(Object.getPrototypeOf(nullPrototype) === null);',
        ),
        '1,true,true,2,false,true',
      );
    },
  },
  {
    name: 'a static __proto__ initializer evaluates an anonymous function without NamedEvaluation',
    run() {
      assertSame(
        run(
          'var object = { __proto__: function () {} }; ' +
            'Object.getPrototypeOf(object).name;',
        ),
        '',
      );
    },
  },
];

export default tests;
