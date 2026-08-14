import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);

  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }

  return completion.value;
}

/**
 * @param {string} source
 * @returns {string}
 */
function thrownName(source) {
  const completion = evaluateScript(createRealm(), source);
  assertSame(completion.type, 'throw');
  return /** @type {any} */ (completion.value).get('name');
}

const tests = [
  {
    name: 'class declarations have a TDZ, become mutable bindings, and create base instances',
    run() {
      assertSame(
        run(`
          var before;
          try {
            C;
          } catch (error) {
            before = error.name;
          }
          class C {
            constructor(value) {
              this.value = value;
            }
            method() {
              return this.value;
            }
            static make(value) {
              return new this(value);
            }
            static innerAssignment() {
              try {
                C = 2;
              } catch (error) {
                return error.name;
              }
            }
          }
          var instance = C.make(4);
          var original = C;
          var innerError = original.innerAssignment();
          C = 1;
          [before, instance.method(), instance instanceof original, innerError, C].join(':');
        `),
        'ReferenceError:4:true:TypeError:1',
      );
      assertSame(
        run(
          'class Empty {} var instance = new Empty(); instance instanceof Empty;',
        ),
        true,
      );
    },
  },
  {
    name: 'named class expressions keep an immutable inner name without leaking it',
    run() {
      assertSame(
        run(`
          var Inner = 'outer';
          var Value = class Inner {
            static self() {
              return Inner;
            }
            static tryAssign() {
              try {
                Inner = 1;
              } catch (error) {
                return error.name;
              }
            }
          };
          [Value.name, Value.self() === Value, Value.tryAssign(), Inner].join(':');
        `),
        'Inner:true:TypeError:outer',
      );
    },
  },
  {
    name: 'anonymous class expressions infer names from bindings assignments properties and defaults',
    run() {
      assertSame(
        run(`
          var assigned;
          var variable = class {};
          assigned = class {};
          var symbol = Symbol('slot');
          var object = {
            property: class {},
            [symbol]: class {}
          };
          var fromDefault = ((value = class {}) => value)();
          [
            variable.name,
            assigned.name,
            object.property.name,
            object[symbol].name,
            fromDefault.name
          ].join(':');
        `),
        'variable:assigned:property:[slot]:value',
      );
    },
  },
  {
    name: 'class constructors methods and accessors expose ES2015 descriptors and call rules',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        `
          class C {
            constructor(value) {
              this.value = value;
            }
            method() {
              return this.value;
            }
            get item() {
              return this.value;
            }
            set item(value) {
              this.value = value;
            }
            static make(value) {
              return new C(value);
            }
          }
        `,
      );
      assertSame(completion.type, 'normal');

      const C = /** @type {any} */ (evaluateScript(realm, 'C').value);
      const prototype = /** @type {any} */ (C.get('prototype'));
      const prototypeDescriptor = C.getOwnProperty('prototype');
      const constructorDescriptor = prototype.getOwnProperty('constructor');
      const methodDescriptor = prototype.getOwnProperty('method');
      const accessorDescriptor = prototype.getOwnProperty('item');
      const staticDescriptor = C.getOwnProperty('make');

      assertSame(C.functionKind, 'classConstructor');
      assertSame(C._isConstructor, true);
      assertSame(prototypeDescriptor.writable, false);
      assertSame(prototypeDescriptor.enumerable, false);
      assertSame(prototypeDescriptor.configurable, false);
      assertSame(constructorDescriptor.value, C);
      assertSame(constructorDescriptor.writable, true);
      assertSame(constructorDescriptor.enumerable, false);
      assertSame(constructorDescriptor.configurable, true);
      assertSame(methodDescriptor.writable, true);
      assertSame(methodDescriptor.enumerable, false);
      assertSame(methodDescriptor.configurable, true);
      assertSame(accessorDescriptor.enumerable, false);
      assertSame(accessorDescriptor.configurable, true);
      assertSame(staticDescriptor.writable, true);
      assertSame(staticDescriptor.enumerable, false);
      assertSame(staticDescriptor.configurable, true);
      assertSame(
        /** @type {any} */ (methodDescriptor.value)._isConstructor,
        false,
      );
      assertSame(
        /** @type {any} */ (methodDescriptor.value).getOwnProperty('prototype'),
        undefined,
      );
      assertSame(
        /** @type {any} */ (accessorDescriptor.get)._isConstructor,
        false,
      );
      assertSame(
        /** @type {any} */ (accessorDescriptor.set)._isConstructor,
        false,
      );
      assertSame(
        run(
          'class C { method() {} } var call; var construct; try { C(); } catch (error) { call = error.name; } try { new C.prototype.method(); } catch (error) { construct = error.name; } call + ":" + construct;',
        ),
        'TypeError:TypeError',
      );
    },
  },
  {
    name: 'class calls ignore mutable names and throw a TypeError',
    run() {
      const realm = createRealm();
      const nameCompletion = evaluateScript(
        realm,
        `
          class C {}
          var getterCalls = 0;
          Object.defineProperty(C, 'name', {
            configurable: true,
            get: function () {
              getterCalls += 1;
              return Symbol('poison');
            }
          });
          var caught;
          try {
            C();
          } catch (error) {
            caught = error;
          }
          [getterCalls, caught.name, caught.message].join(':');
        `,
      );

      assertSame(nameCompletion.type, 'normal');
      assertSame(
        nameCompletion.value,
        "0:TypeError:Class constructor cannot be invoked without 'new'",
      );
    },
  },
  {
    name: 'class calls create TypeErrors in the callee realm',
    run() {
      const calleeRealm = createRealm();
      const callerRealm = createRealm();
      const classCompletion = evaluateScript(
        calleeRealm,
        'class ForeignClass {}; ForeignClass;',
      );

      assertSame(classCompletion.type, 'normal');
      callerRealm.globalObject.defineOwnProperty('ForeignClass', {
        value: classCompletion.value,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      const crossRealmCompletion = evaluateScript(callerRealm, 'ForeignClass();');

      assertSame(crossRealmCompletion.type, 'throw');
      assertSame(
        /** @type {any} */ (crossRealmCompletion.value).getPrototype(),
        calleeRealm.intrinsics.typeErrorPrototype,
      );
    },
  },
  {
    name: 'class constructors and methods inherit restricted caller and arguments properties',
    run() {
      assertSame(
        run(`
          function inspect(target) {
            var callerRead;
            var callerWrite;
            var argumentsRead;
            var argumentsWrite;
            try { target.caller; } catch (error) { callerRead = error.name; }
            try { target.caller = 1; } catch (error) { callerWrite = error.name; }
            try { target.arguments; } catch (error) { argumentsRead = error.name; }
            try { target.arguments = 1; } catch (error) { argumentsWrite = error.name; }
            return [
              target.hasOwnProperty('caller'),
              target.hasOwnProperty('arguments'),
              callerRead,
              callerWrite,
              argumentsRead,
              argumentsWrite,
              target.hasOwnProperty('caller'),
              target.hasOwnProperty('arguments')
            ].join(':');
          }
          class C {
            constructor() {}
            method() {}
            static staticMethod() {}
          }
          inspect(C.prototype.method) + '|' + inspect(C.staticMethod) + '|' + inspect(C);
        `),
        'false:false:TypeError:TypeError:TypeError:TypeError:false:false|' +
          'false:false:TypeError:TypeError:TypeError:TypeError:false:false|' +
          'false:false:TypeError:TypeError:TypeError:TypeError:false:false',
      );
    },
  },
  {
    name: 'computed class names evaluate once left to right and preserve method names',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        `
          var order = '';
          function key(value) {
            order = order + value;
            return value;
          }
          var symbol = Symbol('slot');
          class C {
            [key('a')]() {
              return 1;
            }
            get [key('b')]() {
              return this.stored;
            }
            set [key('c')](value) {
              this.stored = value;
            }
            static [key('d')]() {
              return 4;
            }
            static [symbol]() {
              return 5;
            }
            ['constructor']() {
              return 6;
            }
          }
          var instance = new C();
          instance.c = 2;
        `,
      );
      assertSame(completion.type, 'normal');

      const C = /** @type {any} */ (evaluateScript(realm, 'C').value);
      const symbol = realm.globalObject.get('symbol');
      const prototype = /** @type {any} */ (C.get('prototype'));
      assertSame(realm.globalObject.get('order'), 'abcd');
      assertSame(
        evaluateScript(
          realm,
          'instance.a() + ":" + instance.b + ":" + C.d() + ":" + C[symbol]() + ":" + instance.constructor();',
        ).value,
        '1:2:4:5:6',
      );
      assertSame(/** @type {any} */ (prototype.get('a')).get('name'), 'a');
      assertSame(prototype.getOwnProperty('b').get.get('name'), 'get b');
      assertSame(prototype.getOwnProperty('c').set.get('name'), 'set c');
      assertSame(/** @type {any} */ (C.get('d')).get('name'), 'd');
      assertSame(/** @type {any} */ (C.get(symbol)).get('name'), '[slot]');
    },
  },
  {
    name: 'class heritage expressions run strictly without leaking globals',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        `
          var errorName;
          try {
            class C extends (heritageLeak = Object) {}
          } catch (error) {
            errorName = error.name;
          }
          errorName;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'ReferenceError');
      assertSame(realm.globalObject.getOwnProperty('heritageLeak'), undefined);
      assertSame(
        run(`
          var order = '';
          class Base {}
          function heritage() {
            order = order + 'heritage';
            return Base;
          }
          function key() {
            order = order + ':key';
            return 'method';
          }
          class C extends heritage() {
            [key()]() {}
          }
          order;
        `),
        'heritage:key',
      );
    },
  },
  {
    name: 'computed class names run strictly without leaking globals',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        `
          var errorName;
          try {
            class C {
              [computedLeak = 'method']() {}
            }
          } catch (error) {
            errorName = error.name;
          }
          errorName;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'ReferenceError');
      assertSame(realm.globalObject.getOwnProperty('computedLeak'), undefined);
    },
  },
  {
    name: 'computed special class keys retain ordinary instance definitions and reject static prototype replacement',
    run() {
      assertSame(
        run(
          'class C { ["constructor"]() { return 7; } } new C().constructor();',
        ),
        7,
      );
      assertSame(
        thrownName('class C { static ["prototype"]() {} }'),
        'TypeError',
      );
    },
  },
  {
    name: 'base constructors retain their allocated this unless they return an object',
    run() {
      assertSame(
        run(`
          class Base {
            constructor(kind) {
              this.kind = 'this';
              if (kind === 'object') {
                return { kind: 'object' };
              }
              if (kind === 'primitive') {
                return 1;
              }
            }
          }
          [new Base('object').kind, new Base('primitive').kind, new Base().kind].join(':');
        `),
        'object:this:this',
      );
    },
  },
  {
    name: 'bound super construction preserves an explicit base-constructor object return',
    run() {
      assertSame(
        run(`
          class Base {
            constructor() {
              return Object.create(Base.prototype);
            }
          }
          var BoundBase = Base.bind(null);
          BoundBase.prototype = Base.prototype;
          class Derived extends BoundBase {}
          var result = new Derived();
          [
            Object.getPrototypeOf(result) === Base.prototype,
            result instanceof Base,
            result instanceof Derived
          ].join(':');
        `),
        'true:true:false',
      );
    },
  },
  {
    name: 'derived classes inherit static and instance behavior with super receivers',
    run() {
      assertSame(
        run(`
          class Parent {
            constructor(value) {
              this.value = value;
            }
            method() {
              return this.value;
            }
            get property() {
              return this.value;
            }
            set property(value) {
              this.value = value;
            }
            static make(value) {
              return new this(value);
            }
            static label() {
              return this.kind;
            }
          }
          Parent.kind = 'parent';
          class Child extends Parent {
            constructor(value) {
              super(value);
              this.extra = 1;
            }
            method() {
              return super.method() + this.extra;
            }
            read() {
              return super.property;
            }
            write(value) {
              super.property = value;
            }
            static label() {
              return super.label() + ':child';
            }
          }
          Child.kind = 'child';
          var instance = Child.make(4);
          var receiver = Object.create(Child.prototype);
          receiver.value = 8;
          receiver.extra = 2;
          receiver.write(9);
          [
            instance.method(),
            instance instanceof Child,
            instance instanceof Parent,
            Child.label(),
            receiver.read(),
            receiver.method(),
            Object.getPrototypeOf(Child) === Parent,
            Object.getPrototypeOf(Child.prototype) === Parent.prototype
          ].join(':');
        `),
        '5:true:true:child:child:9:11:true:true',
      );
    },
  },
  {
    name: 'class constructors use their instance-side HomeObject for super properties',
    run() {
      assertSame(
        run(`
          Object.prototype.readBaseValue = function () {
            return this.value + 1;
          };
          class Base {
            constructor(value) {
              this.value = value;
              this.base = super.readBaseValue();
            }
            method() {
              return this.value;
            }
          }
          class Derived extends Base {
            constructor(value) {
              super(value);
              this.direct = super.method();
              this.computed = super['method']();
              this.fromArrow = (() => super.method())();
            }
          }
          var instance = new Derived(4);
          [instance.base, instance.direct, instance.computed, instance.fromArrow].join(':');
        `),
        '5:4:4:4',
      );
    },
  },
  {
    name: 'derived construction enforces super initialization and supports lexical arrows',
    run() {
      assertSame(
        run(`
          class Base {
            constructor(value) {
              this.value = value;
            }
          }
          class Arrow extends Base {
            constructor() {
              var noThis = () => 1;
              var later = () => this.value;
              var before = noThis();
              super(4);
              this.result = before + later();
            }
          }
          var beforeThis;
          var beforeProperty;
          var twice;
          try {
            new (class extends Base {
              constructor() {
                this.value = 1;
                super(1);
              }
            })();
          } catch (error) {
            beforeThis = error.name;
          }
          try {
            new (class extends Base {
              constructor() {
                super.value;
                super(1);
              }
            })();
          } catch (error) {
            beforeProperty = error.name;
          }
          try {
            new (class extends Base {
              constructor() {
                super(1);
                super(2);
              }
            })();
          } catch (error) {
            twice = error.name;
          }
          [new Arrow().result, beforeThis, beforeProperty, twice].join(':');
        `),
        '5:ReferenceError:ReferenceError:ReferenceError',
      );
    },
  },
  {
    name: 'explicit derived super resolves the constructor current prototype',
    run() {
      assertSame(
        run(`
          class Initial {
            constructor() {
              this.value = 'initial';
            }
          }
          class Replacement {
            constructor() {
              this.value = 'replacement';
            }
          }
          class Derived extends Initial {
            constructor() {
              super();
            }
          }
          Object.setPrototypeOf(Derived, Replacement);
          var instance = new Derived();
          [instance.value, instance instanceof Derived, instance instanceof Replacement].join(':');
        `),
        'replacement:true:false',
      );
    },
  },
  {
    name: 'default derived super resolves the constructor current prototype',
    run() {
      assertSame(
        run(`
          class Initial {
            constructor() {
              this.value = 'initial';
            }
          }
          class Replacement {
            constructor() {
              this.value = 'replacement';
            }
          }
          class Derived extends Initial {}
          Object.setPrototypeOf(Derived, Replacement);
          new Derived().value;
        `),
        'replacement',
      );
    },
  },
  {
    name: 'derived super rejects a current constructor prototype that is not constructible',
    run() {
      assertSame(
        run(`
          class Initial {}
          class Derived extends Initial {
            constructor() {
              super();
            }
          }
          Object.setPrototypeOf(Derived, {});
          var errorName;
          try {
            new Derived();
          } catch (error) {
            errorName = error.name;
          }
          errorName;
        `),
        'TypeError',
      );
    },
  },
  {
    name: 'derived return completion rules distinguish object undefined and primitive values',
    run() {
      assertSame(
        run(`
          class Base {}
          class ObjectReturn extends Base {
            constructor() {
              return { value: 'object' };
            }
          }
          class UndefinedReturn extends Base {
            constructor() {
              return;
            }
          }
          class PrimitiveReturn extends Base {
            constructor() {
              return 1;
            }
          }
          var undefinedError;
          var primitiveError;
          try {
            new UndefinedReturn();
          } catch (error) {
            undefinedError = error.name;
          }
          try {
            new PrimitiveReturn();
          } catch (error) {
            primitiveError = error.name;
          }
          [new ObjectReturn().value, undefinedError, primitiveError].join(':');
        `),
        'object:ReferenceError:TypeError',
      );
    },
  },
  {
    name: 'default and explicit derived constructors forward defaults rest and spread through super',
    run() {
      assertSame(
        run(`
          class Parent {
            constructor(first = 1, ...rest) {
              this.value = first + ':' + rest.join(',');
            }
          }
          class DefaultChild extends Parent {}
          class ExplicitChild extends Parent {
            constructor(first = 2, ...rest) {
              super(first, ...rest);
            }
          }
          var Bound = DefaultChild.bind(null, 3);
          [
            new DefaultChild(...[4, 5, 6]).value,
            new ExplicitChild(undefined, 7, 8).value,
            new Bound(9, 10).value
          ].join(':');
        `),
        '4:5,6:2:7,8:3:9,10',
      );
    },
  },
  {
    name: 'extends null and native constructors retain the requested new target behavior',
    run() {
      assertSame(
        run(`
          class NullClass extends null {
            constructor() {
              return { value: 'null' };
            }
          }
          class NativeChild extends Object {
            constructor() {
              super();
              this.value = 'native';
            }
          }
          class NativeValue extends Object {
            constructor(value) {
              super(value);
            }
          }
          var defaultNullError;
          try {
            new (class extends null {})();
          } catch (error) {
            defaultNullError = error.name;
          }
          var native = new NativeChild();
          var input = {};
          var nativeValue = new NativeValue(input);
          [
            new NullClass().value,
            Object.getPrototypeOf(NullClass.prototype) === null,
            Object.getPrototypeOf(NullClass) === Function.prototype,
            defaultNullError,
            native.value,
            native instanceof NativeChild,
            nativeValue === input,
            nativeValue instanceof NativeValue
          ].join(':');
        `),
        'null:true:true:TypeError:native:true:false:true',
      );
    },
  },
  {
    name: 'heritage is evaluated under the class name TDZ and validates constructors and prototypes',
    run() {
      assertSame(
        run(`
          var selfError;
          var constructorError;
          var prototypeError;
          try {
            class Self extends Self {}
          } catch (error) {
            selfError = error.name;
          }
          try {
            class NotConstructor extends 1 {}
          } catch (error) {
            constructorError = error.name;
          }
          function Broken() {}
          Broken.prototype = 1;
          try {
            class BadPrototype extends Broken {}
          } catch (error) {
            prototypeError = error.name;
          }
          [selfError, constructorError, prototypeError].join(':');
        `),
        'ReferenceError:TypeError:TypeError',
      );
    },
  },
  {
    name: 'a failed class declaration leaves its lexical binding uninitialized',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, 'class C extends C {}').type, 'throw');
      const failedRead = evaluateScript(realm, 'C');
      assertSame(failedRead.type, 'throw');
      assertSame(
        /** @type {any} */ (failedRead.value).get('name'),
        'ReferenceError',
      );
    },
  },
  {
    name: 'classes reject ordinary calls with guest TypeError values',
    run() {
      assertSame(thrownName('class C {} C();'), 'TypeError');
    },
  },
];

export default tests;
