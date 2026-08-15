import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import {
  GuestErrorSignal,
  ThrowSignal,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
} from '../src/runtime/completion.js';
import { GeneratorObject } from '../src/runtime/generator-object.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function evalValue(realm, source) {
  const completion = evaluateScript(realm, source);

  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }

  return completion.value;
}

/**
 * @param {import('../src/runtime/object.js').EngineObject} object
 * @param {string | symbol} key
 * @param {unknown} value
 * @param {boolean} writable
 * @param {boolean} enumerable
 * @param {boolean} configurable
 * @returns {void}
 */
function assertDataDescriptor(
  object,
  key,
  value,
  writable,
  enumerable,
  configurable,
) {
  const descriptor = object.getOwnProperty(key);

  if (descriptor === undefined) {
    throw new Error(`Expected an own descriptor for ${String(key)}`);
  }

  assertSame(descriptor.value, value);
  assertSame(descriptor.writable, writable);
  assertSame(descriptor.enumerable, enumerable);
  assertSame(descriptor.configurable, configurable);
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'generator functions expose the Realm-owned intrinsic lineage without a global GeneratorFunction',
    run() {
      const realm = createRealm();

      assertSame(
        evalValue(
          realm,
          `
            function* g() {}
            var generatorFunction = Object.getPrototypeOf(g).constructor;
            [
              typeof generatorFunction,
              typeof this.GeneratorFunction,
              generatorFunction.name,
              generatorFunction.length,
              Object.getPrototypeOf(generatorFunction) === Function,
              Object.getPrototypeOf(g) === generatorFunction.prototype,
              Object.getPrototypeOf(g()) === g.prototype,
              Object.getPrototypeOf(g.prototype) === generatorFunction.prototype.prototype,
              generatorFunction.prototype.prototype.constructor === generatorFunction.prototype
            ].join(':');
          `,
        ),
        'function:undefined:GeneratorFunction:1:true:true:true:true:true',
      );
    },
  },
  {
    name: 'generator intrinsics use the specified descriptors and constructor identities',
    run() {
      const realm = createRealm();
      evalValue(realm, 'function* g() {}');

      const g = /** @type {import('../src/runtime/object.js').EngineObject} */ (
        realm.globalObject.get('g')
      );
      const generatorFunction =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          g.getPrototype()
        ).get('constructor');
      const generatorFunctionPrototype =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          /** @type {import('../src/runtime/object.js').EngineObject} */ (
            generatorFunction
          ).get('prototype')
        );
      const generatorPrototype =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          generatorFunctionPrototype.get('prototype')
        );
      const toStringTag = realm.agent.wellKnownSymbols.toStringTag;

      assertSame(
        realm.globalObject.getOwnProperty('GeneratorFunction'),
        undefined,
      );
      assertSame(
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          generatorFunction
        ).getPrototype(),
        realm.intrinsics.functionConstructor,
      );
      assertDataDescriptor(
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          generatorFunction
        ),
        'prototype',
        generatorFunctionPrototype,
        false,
        false,
        false,
      );
      assertDataDescriptor(
        generatorFunctionPrototype,
        'constructor',
        generatorFunction,
        false,
        false,
        true,
      );
      assertDataDescriptor(
        generatorFunctionPrototype,
        'prototype',
        generatorPrototype,
        false,
        false,
        true,
      );
      assertSame(
        generatorFunctionPrototype.getPrototype(),
        realm.intrinsics.functionPrototype,
      );
      assertDataDescriptor(
        generatorFunctionPrototype,
        toStringTag,
        'GeneratorFunction',
        false,
        false,
        true,
      );
      assertDataDescriptor(
        generatorPrototype,
        'constructor',
        generatorFunctionPrototype,
        false,
        false,
        true,
      );

      for (const name of ['next', 'return', 'throw']) {
        const descriptor = generatorPrototype.getOwnProperty(name);

        if (descriptor === undefined) {
          throw new Error(`Expected Generator prototype method ${name}`);
        }

        assertSame(descriptor.writable, true);
        assertSame(descriptor.enumerable, false);
        assertSame(descriptor.configurable, true);
      }

      assertDataDescriptor(
        generatorPrototype,
        toStringTag,
        'Generator',
        false,
        false,
        true,
      );
      assertSame(
        generatorPrototype.get('constructor'),
        generatorFunctionPrototype,
      );
      assertSame(
        generatorPrototype.getPrototype(),
        realm.intrinsics.iteratorPrototype,
      );
    },
  },
  {
    name: 'GeneratorFunction.prototype is an ordinary non-callable non-constructible object',
    run() {
      const realm = createRealm();

      assertSame(
        evalValue(
          realm,
          `
            (function () {
              function* sample() {}
              var prototype = sample.constructor.prototype;
              var callError;
              var constructError;

              try {
                prototype();
              } catch (error) {
                callError = error.name;
              }

              try {
                new prototype();
              } catch (error) {
                constructError = error.name;
              }

              return [
                typeof prototype,
                Object.getPrototypeOf(prototype) === Function.prototype,
                callError,
                constructError
              ].join(':');
            })();
          `,
        ),
        'object:true:TypeError:TypeError',
      );
    },
  },
  {
    name: 'generator state methods implement completed and suspended-start behavior',
    run() {
      const realm = createRealm();

      assertSame(
        evalValue(
          realm,
          `
            function* empty() {}
            var iterator = empty();
            var first = iterator.next(1);
            var second = iterator.next(2);
            var returned = iterator.return(3);
            var thrown = {};
            var caught;
            try {
              iterator.throw(thrown);
            } catch (error) {
              caught = error === thrown;
            }
            [
              first.value,
              first.done,
              second.value,
              second.done,
              returned.value,
              returned.done,
              caught
            ].join(':');
          `,
        ),
        ':true::true:3:true:true',
      );
      assertSame(
        evalValue(
          realm,
          `
            var reached = 0;
            function* neverStarted() {
              reached = reached + 1;
            }
            var returned = neverStarted().return(4);
            var thrown = {};
            var caught;
            try {
              neverStarted().throw(thrown);
            } catch (error) {
              caught = error === thrown;
            }
            [returned.value, returned.done, caught, reached].join(':');
          `,
        ),
        '4:true:true:0',
      );
    },
  },
  {
    name: 'generator methods reject incompatible and construct receivers',
    run() {
      const realm = createRealm();

      assertSame(
        evalValue(
          realm,
          `
            function* g() {}
            var prototype = Object.getPrototypeOf(g());
            var names = [];
            var functionError;
            try {
              new g();
            } catch (error) {
              functionError = error.name;
            }
            for (var name of ['next', 'throw', 'return']) {
              try {
                prototype[name].call({});
              } catch (error) {
                names.push(error.name);
              }
              try {
                new prototype[name]();
              } catch (error) {
                names.push(error.name);
              }
            }
            var object = { *method() {} };
            var methodError;
            try {
              new object.method();
            } catch (error) {
              methodError = error.name;
            }
            functionError + ':' + names.join(':') + ':' + methodError;
          `,
        ),
        'TypeError:TypeError:TypeError:TypeError:TypeError:TypeError:TypeError:TypeError',
      );
    },
  },
  {
    name: 'generator calls use their current object prototype or the intrinsic fallback',
    run() {
      const realm = createRealm();

      assertSame(
        evalValue(
          realm,
          `
            function* g() {}
            var intrinsic = Object.getPrototypeOf(g.prototype);
            var custom = {};
            g.prototype = custom;
            var customResult = Object.getPrototypeOf(g()) === custom;
            g.prototype = 1;
            var fallbackResult = Object.getPrototypeOf(g()) === intrinsic;
            customResult + ':' + fallbackResult;
          `,
        ),
        'true:true',
      );
    },
  },
  {
    name: 'generator source forms preserve function metadata and home objects',
    run() {
      const realm = createRealm();
      evalValue(
        realm,
        `
          function* declaration(first, second = 1) {}
          var named = function* explicit(first, second) {};
          var inferred = function* (first, second = 1) {};
          var object = { *method(first, second = 1) {} };
          class C {
            *instance(first, second = 1) {}
            static *stat(first, second = 1) {}
          }
        `,
      );

      const declaration =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          realm.globalObject.get('declaration')
        );
      const named =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          realm.globalObject.get('named')
        );
      const inferred =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          realm.globalObject.get('inferred')
        );
      const object =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          realm.globalObject.get('object')
        );
      const objectMethod =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          object.get('method')
        );
      const constructor =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          evalValue(realm, 'C')
        );
      const instancePrototype =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          constructor.get('prototype')
        );
      const instanceMethod =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          instancePrototype.get('instance')
        );
      const staticMethod =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          constructor.get('stat')
        );

      /** @type {[import('../src/runtime/function-object.js').EngineFunction, string, number][]} */
      const metadata = [
        [declaration, 'declaration', 1],
        [named, 'explicit', 2],
        [inferred, 'inferred', 1],
        [objectMethod, 'method', 1],
        [instanceMethod, 'instance', 1],
        [staticMethod, 'stat', 1],
      ];

      for (const [functionObject, name, length] of metadata) {
        assertSame(functionObject.get('name'), name);
        assertSame(functionObject.get('length'), length);
        assertSame(functionObject._isConstructor, false);
        assertSame(
          functionObject.getOwnProperty('prototype') === undefined,
          false,
        );
        assertSame(
          /** @type {import('../src/runtime/object.js').EngineObject} */ (
            functionObject.get('prototype')
          ).getOwnProperty('constructor'),
          undefined,
        );
        assertSame(functionObject.getOwnProperty('caller'), undefined);
        assertSame(functionObject.getOwnProperty('arguments'), undefined);
      }

      assertSame(declaration.functionKind, 'generator');
      assertSame(named.functionKind, 'generator');
      assertSame(inferred.functionKind, 'generator');
      assertSame(objectMethod.functionKind, 'generatorMethod');
      assertSame(instanceMethod.functionKind, 'generatorMethod');
      assertSame(staticMethod.functionKind, 'generatorMethod');
      assertSame(declaration.strict, false);
      assertSame(objectMethod.strict, false);
      assertSame(instanceMethod.strict, true);
      assertSame(staticMethod.strict, true);
      assertSame(objectMethod.methodHomeObject, object);
      assertSame(instanceMethod.methodHomeObject, instancePrototype);
      assertSame(staticMethod.methodHomeObject, constructor);
      assertSame(
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          declaration.get('prototype')
        ).getPrototype(),
        realm.intrinsics.generatorPrototype,
      );
    },
  },
  {
    name: 'generator calls instantiate parameters before their bodies execute',
    run() {
      const realm = createRealm();

      assertSame(
        evalValue(
          realm,
          `
            var defaults = 0;
            var bodies = 0;
            function* g({ value = (defaults = defaults + 1) } = {}) {
              bodies = bodies + value;
            }
            var iterator = g();
            var before = defaults + ':' + bodies;
            var result = iterator.next();
            before + ':' + defaults + ':' + bodies + ':' + result.done;
          `,
        ),
        '1:0:1:1:true',
      );
      assertSame(
        evalValue(
          createRealm(),
          `
            var error = {};
            var iterator;
            function fail() {
              throw error;
            }
            function* g(value = fail()) {}
            var caught;
            try {
              iterator = g();
            } catch (reason) {
              caught = reason === error;
            }
            caught + ':' + (iterator === undefined);
          `,
        ),
        'true:true',
      );
    },
  },
  {
    name: 'GeneratorObject releases terminal continuations and preserves guest signals',
    run() {
      const realm = createRealm();
      const generatorPrototype =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          realm.intrinsics.generatorPrototype
        );
      /** @type {import('../src/runtime/generator-object.js').GeneratorResumeCompletion[]} */
      const inputs = [];
      /** @type {import('../src/runtime/generator-object.js').GeneratorObject} */
      let generator;
      /** @type {GuestErrorSignal | undefined} */
      let reentrant;
      /** @type {import('../src/runtime/generator-object.js').GeneratorContinuation} */
      const continuation = {
        resume(completion) {
          inputs.push(completion);
          reentrant = /** @type {GuestErrorSignal} */ (
            assertThrows(
              () => generator.resume(createNormalCompletion('reentrant')),
              GuestErrorSignal,
            )
          );
          return { type: 'yield', value: 'pause' };
        },
      };

      generator = new GeneratorObject(realm, generatorPrototype, continuation);
      const yielded = generator.resume(createNormalCompletion('ignored'));

      if (reentrant === undefined) {
        throw new Error('Expected reentrant resume to throw');
      }

      assertSame(inputs.length, 1);
      assertSame(inputs[0].type, 'normal');
      assertSame(inputs[0].value, undefined);
      assertSame(reentrant.typeName, 'TypeError');
      assertSame(generator.state, 'suspendedYield');
      assertSame(yielded.get('value'), 'pause');
      assertSame(yielded.get('done'), false);
      assertSame(yielded.getPrototype(), realm.intrinsics.objectPrototype);

      const returned = new GeneratorObject(realm, generatorPrototype, {
        resume() {
          return {
            type: 'complete',
            completion: createReturnCompletion('finished'),
          };
        },
      });
      const result = returned.resume(createNormalCompletion(undefined));

      assertSame(result.get('value'), 'finished');
      assertSame(result.get('done'), true);
      assertSame(returned.state, 'completed');
      assertSame(returned.continuation, null);

      const thrownValue = {};
      const throwing = new GeneratorObject(realm, generatorPrototype, {
        resume() {
          return {
            type: 'complete',
            completion: createThrowCompletion(thrownValue),
          };
        },
      });
      const thrown = /** @type {ThrowSignal} */ (
        assertThrows(
          () => throwing.resume(createNormalCompletion(undefined)),
          ThrowSignal,
        )
      );

      assertSame(thrown.value, thrownValue);
      assertSame(throwing.state, 'completed');
      assertSame(throwing.continuation, null);
    },
  },
  {
    name: 'GeneratorObject completes on unexpected continuation errors',
    run() {
      const realm = createRealm();
      const generatorPrototype =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          realm.intrinsics.generatorPrototype
        );
      const failure = new Error('unexpected continuation failure');
      const generator = new GeneratorObject(realm, generatorPrototype, {
        resume() {
          throw failure;
        },
      });
      const thrown = assertThrows(
        () => generator.resume(createNormalCompletion(undefined)),
        Error,
      );

      assertSame(thrown, failure);
      assertSame(generator.state, 'completed');
      assertSame(generator.continuation, null);

      const guestFailure = new GuestErrorSignal('TypeError', 'guest failure');
      const guestGenerator = new GeneratorObject(realm, generatorPrototype, {
        resume() {
          throw guestFailure;
        },
      });
      const guestThrown = /** @type {GuestErrorSignal} */ (
        assertThrows(
          () => guestGenerator.resume(createNormalCompletion(undefined)),
          GuestErrorSignal,
        )
      );

      assertSame(guestThrown, guestFailure);
      assertSame(guestGenerator.state, 'completed');
      assertSame(guestGenerator.continuation, null);
    },
  },
];

export default tests;
