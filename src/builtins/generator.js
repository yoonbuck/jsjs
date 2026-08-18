import { EngineObject } from '../runtime/object.js';
import { GeneratorObject } from '../runtime/generator-object.js';
import { createDynamicFunction } from '../evaluator/dynamic-function.js';
import {
  GuestErrorSignal,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
} from '../runtime/completion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{
 *   generatorFunctionConstructor: NativeFunction,
 *   generatorFunctionPrototype: EngineObject,
 *   generatorPrototype: EngineObject,
 * }} GeneratorIntrinsics
 */

/**
 * Creates the per-Realm generator intrinsic graph. `%GeneratorFunction%` stays
 * intentionally unreachable from the global object; source generator functions
 * expose it through their inherited `constructor` property instead.
 *
 * @param {Realm} realm
 * @returns {GeneratorIntrinsics}
 */
export function createGeneratorIntrinsics(realm) {
  const generatorFunctionPrototype = new EngineObject(
    realm.intrinsics.functionPrototype,
  );
  const iteratorPrototype = realm.intrinsics.iteratorPrototype;

  if (!(iteratorPrototype instanceof EngineObject)) {
    throw new TypeError(
      'Realm is missing required %IteratorPrototype% intrinsic',
    );
  }

  const generatorPrototype = new EngineObject(iteratorPrototype);
  const generatorFunctionConstructor = realm.createNativeFunction({
    name: 'GeneratorFunction',
    length: 1,
    prototype: generatorFunctionPrototype,
    call(_thisValue, args, functionObject) {
      return createDynamicFunction(functionObject.realm, args, 'generator');
    },
    construct(args, functionObject) {
      return createDynamicFunction(functionObject.realm, args, 'generator');
    },
  });
  const functionConstructor = realm.intrinsics.functionConstructor;

  if (!(functionConstructor instanceof EngineObject)) {
    throw new TypeError('Realm is missing required %Function% intrinsic');
  }

  if (!generatorFunctionConstructor.setPrototypeOf(functionConstructor)) {
    throw new TypeError('Cannot initialize %GeneratorFunction% inheritance');
  }

  generatorFunctionPrototype.defineOwnProperty('constructor', {
    value: generatorFunctionConstructor,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  generatorFunctionPrototype.defineOwnProperty('prototype', {
    value: generatorPrototype,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  defineToStringTag(
    generatorFunctionPrototype,
    realm.agent.wellKnownSymbols.toStringTag,
    'GeneratorFunction',
  );

  generatorPrototype.defineOwnProperty('constructor', {
    value: generatorFunctionPrototype,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  defineBuiltinMethod(
    generatorPrototype,
    'next',
    realm.createNativeFunction({
      name: 'next',
      length: 1,
      generatorResume: true,
      call(thisValue, args) {
        const generator = requireGenerator(thisValue, 'next');

        realm.agent.linkGeneratorHostChain(generator.realm.agent);
        return generator.resume(createNormalCompletion(args[0]), realm);
      },
    }),
  );
  defineBuiltinMethod(
    generatorPrototype,
    'return',
    realm.createNativeFunction({
      name: 'return',
      length: 1,
      generatorResume: true,
      call(thisValue, args) {
        const generator = requireGenerator(thisValue, 'return');

        realm.agent.linkGeneratorHostChain(generator.realm.agent);
        return generator.resume(createReturnCompletion(args[0]), realm);
      },
    }),
  );
  defineBuiltinMethod(
    generatorPrototype,
    'throw',
    realm.createNativeFunction({
      name: 'throw',
      length: 1,
      generatorResume: true,
      call(thisValue, args) {
        const generator = requireGenerator(thisValue, 'throw');

        realm.agent.linkGeneratorHostChain(generator.realm.agent);
        return generator.resume(createThrowCompletion(args[0]), realm);
      },
    }),
  );
  defineToStringTag(
    generatorPrototype,
    realm.agent.wellKnownSymbols.toStringTag,
    'Generator',
  );

  return {
    generatorFunctionConstructor,
    generatorFunctionPrototype,
    generatorPrototype,
  };
}

/**
 * @param {unknown} value
 * @param {string} method
 * @returns {GeneratorObject}
 */
function requireGenerator(value, method) {
  if (!(value instanceof GeneratorObject)) {
    throw new GuestErrorSignal(
      'TypeError',
      `Generator.prototype.${method} called on incompatible receiver`,
    );
  }

  return value;
}

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {NativeFunction} method
 * @returns {void}
 */
function defineBuiltinMethod(target, name, method) {
  target.defineOwnProperty(name, {
    value: method,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {EngineObject} target
 * @param {symbol} toStringTag
 * @param {string} tag
 * @returns {void}
 */
function defineToStringTag(target, toStringTag, tag) {
  target.defineOwnProperty(toStringTag, {
    value: tag,
    writable: false,
    enumerable: false,
    configurable: true,
  });
}
