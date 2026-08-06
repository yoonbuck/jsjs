import { EngineObject } from '../runtime/object.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { isConstructor } from '../runtime/descriptors.js';
import { toInteger } from '../runtime/conversion.js';
import {
  NativeFunction,
  createListFromArrayLike,
  requireCallable,
  requireObjectReceiver,
} from './shared.js';

/**
 * @typedef {import('../runtime/descriptors.js').CallableLike} CallableLike
 * @typedef {import('../runtime/realm.js').Realm} Realm
 */

class BoundFunction extends NativeFunction {
  /**
   * @param {Realm} realm
   * @param {CallableLike} target
   * @param {unknown} boundThis
   * @param {readonly unknown[]} boundArgs
   */
  constructor(realm, target, boundThis, boundArgs) {
    const targetLength =
      target instanceof EngineObject ? toInteger(target.get('length')) : 0;
    const length =
      targetLength > boundArgs.length ? targetLength - boundArgs.length : 0;
    /** @type {import('./shared.js').NativeFunctionOptions['construct']} */
    let construct;

    if (isConstructor(target)) {
      construct = (args) => {
        const result = target.constructFunction(
          combineArguments(boundArgs, args),
        );

        if (!(result instanceof EngineObject)) {
          throw new TypeError('Bound constructor target must return an object');
        }

        return result;
      };
    }

    super(realm, {
      name: 'bound',
      length,
      call(_thisValue, args) {
        return target.callFunction(
          boundThis,
          combineArguments(boundArgs, args),
        );
      },
      construct,
    });

    this.boundTargetFunction = target;
    this.boundThis = boundThis;
    this.boundArguments = [...boundArgs];

    const thrower = /** @type {CallableLike} */ (
      realm.intrinsics.throwTypeErrorFunction
    );
    const restricted = {
      get: thrower,
      set: thrower,
      enumerable: false,
      configurable: false,
    };
    this.defineOwnProperty('caller', restricted);
    this.defineOwnProperty('arguments', restricted);
  }

  /**
   * @param {unknown} value
   * @returns {boolean}
   */
  hasInstance(value) {
    const target = /** @type {any} */ (this.boundTargetFunction);

    if (typeof target.hasInstance !== 'function') {
      throw new GuestErrorSignal(
        'TypeError',
        'Bound target does not support instanceof',
      );
    }

    return target.hasInstance(value);
  }
}

/**
 * @param {Realm} realm
 * @returns {{ functionConstructor: NativeFunction }}
 */
export function createFunctionIntrinsics(realm) {
  const { functionPrototype } = realm.intrinsics;

  /**
   * @returns {never}
   */
  function rejectDynamicFunction() {
    throw new GuestErrorSignal(
      'Error',
      'Dynamic Function constructor is not supported',
    );
  }

  const functionConstructor = realm.createNativeFunction({
    name: 'Function',
    length: 1,
    prototype: functionPrototype,
    call() {
      return rejectDynamicFunction();
    },
    construct() {
      return rejectDynamicFunction();
    },
  });

  functionPrototype.defineOwnProperty('constructor', {
    value: functionConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  defineNativeMethod(realm, functionPrototype, 'toString', 0, (thisValue) => {
    const target = requireCallable(
      thisValue,
      'Function receiver is not callable',
    );
    const name =
      target instanceof NativeFunction && target._nativeName !== ''
        ? ` ${target._nativeName}`
        : '';
    return `function${name}() { /* jsjs code */ }`;
  });
  defineNativeMethod(
    realm,
    functionPrototype,
    'apply',
    2,
    (thisValue, args) => {
      const target = requireCallable(
        thisValue,
        'Function.prototype.apply receiver is not callable',
      );
      const thisArgument = args[0];
      const argumentArray = args[1];
      const callArguments =
        argumentArray === null || argumentArray === undefined
          ? []
          : createListFromArrayLike(
              requireObjectReceiver(
                argumentArray,
                'Function.prototype.apply arguments must be an object',
              ),
            );
      return target.callFunction(thisArgument, callArguments);
    },
  );
  defineNativeMethod(realm, functionPrototype, 'call', 1, (thisValue, args) => {
    const target = requireCallable(
      thisValue,
      'Function.prototype.call receiver is not callable',
    );
    const callArguments = [];

    for (let index = 1; index < args.length; index += 1) {
      callArguments.push(args[index]);
    }

    return target.callFunction(args[0], callArguments);
  });
  defineNativeMethod(realm, functionPrototype, 'bind', 1, (thisValue, args) => {
    const target = requireCallable(
      thisValue,
      'Function.prototype.bind receiver is not callable',
    );
    const boundArguments = [];

    for (let index = 1; index < args.length; index += 1) {
      boundArguments.push(args[index]);
    }

    return new BoundFunction(realm, target, args[0], boundArguments);
  });

  return { functionConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {{ functionConstructor: NativeFunction }} intrinsics
 * @returns {void}
 */
export function installFunctionConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Function', {
    value: intrinsics.functionConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {readonly unknown[]} prefix
 * @param {readonly unknown[]} suffix
 * @returns {unknown[]}
 */
function combineArguments(prefix, suffix) {
  const result = [];

  for (const value of prefix) {
    result.push(value);
  }

  for (const value of suffix) {
    result.push(value);
  }

  return result;
}

/**
 * @param {Realm} realm
 * @param {EngineObject} target
 * @param {string} name
 * @param {number} length
 * @param {import('./shared.js').NativeFunctionOptions['call']} call
 * @returns {void}
 */
function defineNativeMethod(realm, target, name, length, call) {
  target.defineOwnProperty(name, {
    value: realm.createNativeFunction({ name, length, call }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
