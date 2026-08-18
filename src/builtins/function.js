/**
 * The `Function` constructor (ECMA-262 15.3.1 / 15.3.2) and the
 * `Function.prototype` methods (`toString`, `apply`, `call`, `bind`).
 *
 * The dynamic `Function` constructor compiles runtime source text into guest
 * code, so — like `eval` — it must reach the engine's parser and function
 * builder. Importing `src/evaluator/dynamic-function.js` here is therefore a
 * deliberate, documented instance of the same "a builtin that *is* an
 * evaluator feature may import the evaluator" exception that
 * `src/builtins/global-eval.js` records. The chain `runtime/realm.js ->
 * builtins/function.js -> evaluator/dynamic-function.js -> {parser.js,
 * evaluator/*, runtime/*}` stays acyclic because nothing under
 * `src/evaluator/` imports `runtime/realm.js` at runtime.
 */

import { EngineObject } from '../runtime/object.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { isConstructor } from '../runtime/descriptors.js';
import { toInteger } from '../runtime/conversion.js';
import { createDynamicFunction } from '../evaluator/dynamic-function.js';
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
    /** @type {BoundFunction | undefined} */
    let boundFunction;

    if (isConstructor(target)) {
      construct = (args, _functionObject, newTarget, callerRealm) => {
        const result = target.constructFunction(
          combineArguments(boundArgs, args),
          newTarget === boundFunction ? target : newTarget,
          callerRealm ?? realm,
        );

        if (!(result instanceof EngineObject)) {
          throw new TypeError('Bound constructor target must return an object');
        }

        return result;
      };
    }

    const targetName =
      target instanceof EngineObject ? target.get('name') : undefined;
    const boundName = `bound ${typeof targetName === 'string' ? targetName : ''}`;
    const targetPrototype =
      target instanceof EngineObject
        ? target.getPrototype()
        : realm.intrinsics.functionPrototype;

    super(realm, {
      name: boundName,
      length,
      call(_thisValue, args, _functionObject, callerRealm) {
        return target.callFunction(
          boundThis,
          combineArguments(boundArgs, args),
          callerRealm ?? realm,
        );
      },
      construct,
      // `construct` above delegates with the corrected target/newTarget pair,
      // so NativeFunction's ordinary allocation retargeting must not rewrite
      // an explicit object the target returns.
      retargetConstructionResult: false,
    });

    if (!this.setPrototypeOf(targetPrototype)) {
      throw new TypeError('Cannot initialize bound function inheritance');
    }

    this.boundTargetFunction = target;
    this.boundThis = boundThis;
    this.boundArguments = [...boundArgs];
    boundFunction = this;

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
   * ES5.1 15.3.4.5.3: a bound function's `[[HasInstance]]` is its target's.
   *
   * The bound chain is unwrapped iteratively rather than by delegating one
   * frame at a time, because guest code can lengthen it at runtime
   * (`g = g.bind(null)` in a loop) and a frame per link would let `instanceof`
   * exhaust the host stack. Every link in a chain is itself a bound function,
   * so walking to the first target that is not one is exactly what repeated
   * delegation would have done.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  hasInstance(value) {
    /** @type {any} */
    let target = this.boundTargetFunction;

    while (target instanceof BoundFunction) {
      target = target.boundTargetFunction;
    }

    if (typeof target?.hasInstance !== 'function') {
      throw new GuestErrorSignal(
        'TypeError',
        'Bound target does not support instanceof',
      );
    }

    return target.hasInstance(value);
  }

  /**
   * @returns {import('../runtime/function-realm.js').JobCompletion}
   */
  getFunctionRealm() {
    /** @type {CallableLike} */
    let target = this.boundTargetFunction;

    while (target instanceof BoundFunction) {
      target = target.boundTargetFunction;
    }

    return target.getFunctionRealm();
  }
}

/**
 * @param {Realm} realm
 * @returns {{ functionConstructor: NativeFunction }}
 */
export function createFunctionIntrinsics(realm) {
  const { functionPrototype } = realm.intrinsics;
  const thrower = /** @type {CallableLike | undefined} */ (
    realm.intrinsics.throwTypeErrorFunction
  );

  if (thrower === undefined) {
    throw new TypeError('Realm is missing required %ThrowTypeError% intrinsic');
  }

  const restricted = {
    get: thrower,
    set: thrower,
    enumerable: false,
    configurable: true,
  };
  functionPrototype.defineOwnProperty('caller', restricted);
  functionPrototype.defineOwnProperty('arguments', restricted);

  const functionConstructor = realm.createNativeFunction({
    name: 'Function',
    length: 1,
    prototype: functionPrototype,
    call(_thisValue, args, functionObject) {
      // Calling and constructing `Function` are identical (15.3.1.1 defers to
      // 15.3.2.1). Use the invoked constructor's *owning* realm so a
      // cross-realm call still allocates in, and closes over, that realm.
      return createDynamicFunction(functionObject.realm, args);
    },
    construct(args, functionObject) {
      return createDynamicFunction(functionObject.realm, args);
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
    (thisValue, args, _functionObject, callerRealm) => {
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
      return target.callFunction(
        thisArgument,
        callArguments,
        callerRealm ?? realm,
      );
    },
  );
  defineNativeMethod(
    realm,
    functionPrototype,
    'call',
    1,
    (thisValue, args, _functionObject, callerRealm) => {
      const target = requireCallable(
        thisValue,
        'Function.prototype.call receiver is not callable',
      );
      const callArguments = [];

      for (let index = 1; index < args.length; index += 1) {
        callArguments.push(args[index]);
      }

      return target.callFunction(args[0], callArguments, callerRealm ?? realm);
    },
  );
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
