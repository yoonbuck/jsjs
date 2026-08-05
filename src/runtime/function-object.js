import { EngineObject } from './object.js';
import { isAccessorDescriptor } from './descriptors.js';
import { createUnsupportedOperationError } from './errors.js';
import { ThrowSignal, GuestErrorSignal } from './completion.js';
import { createGuestError } from '../builtins/errors.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 * @typedef {import('./realm.js').Realm} Realm
 * @typedef {import('./environment.js').EnvironmentRecordLike} EnvironmentRecordLike
 * @typedef {{ type: string, value: unknown }} Completion
 *
 * @typedef {(
 *   functionObject: EngineFunction,
 *   thisValue: unknown,
 *   args: readonly unknown[],
 * ) => Completion} FunctionBodyExecutor
 *
 * @typedef {{
 *   realm: Realm,
 *   parameterNames: readonly string[],
 *   scope: EnvironmentRecordLike,
 *   strict: boolean,
 *   execute: FunctionBodyExecutor,
 * }} EngineFunctionOptions
 */

/**
 * A callable engine object (ECMA-262 13.2 "Creating Function Objects").
 *
 * The function's *body* is not executed here: `EngineFunction` owns the
 * call protocol (`this` resolution, completion unwrapping) while the
 * evaluator supplies an `execute` hook that builds the activation
 * environment and runs the body. That indirection keeps the dependency
 * direction of the design intact — runtime modules never import evaluator
 * modules.
 */
export class EngineFunction extends EngineObject {
  /**
   * @param {EngineFunctionOptions} options
   */
  constructor({ realm, parameterNames, scope, strict, execute }) {
    super(realm.intrinsics.functionPrototype);

    /** @type {Realm} */
    this.realm = realm;
    /** @type {readonly string[]} */
    this.parameterNames = parameterNames;
    /** @type {EnvironmentRecordLike} */
    this.scope = scope;
    /** @type {boolean} */
    this.strict = strict;
    /** @type {FunctionBodyExecutor} */
    this._execute = execute;

    this.defineOwnProperty('length', {
      value: parameterNames.length,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    const prototype = new EngineObject(realm.intrinsics.objectPrototype);
    prototype.defineOwnProperty('constructor', {
      value: this,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    this.defineOwnProperty('prototype', {
      value: prototype,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  }

  /**
   * @param {unknown} thisValue
   * @param {readonly unknown[]} [args=[]]
   * @returns {unknown}
   */
  callFunction(thisValue, args = []) {
    let completion;

    try {
      completion = this._execute(this, this.resolveThisValue(thisValue), args);
    } catch (error) {
      if (error instanceof ThrowSignal) {
        throw error;
      }

      if (error instanceof GuestErrorSignal) {
        // Convert the pre-construction signal into a fully-built guest error
        // object and re-throw as a ThrowSignal so the evaluator's throw
        // machinery and future try/catch handling can intercept it.
        throw new ThrowSignal(
          createGuestError(this.realm, error.typeName, error.guestMessage),
        );
      }

      throw error;
    }

    if (completion.type === 'return') {
      return completion.value;
    }

    if (completion.type === 'normal') {
      return undefined;
    }

    if (completion.type === 'throw') {
      throw new ThrowSignal(completion.value);
    }

    // `break`/`continue` cannot escape a function body: the parser rejects
    // them outside a loop, so reaching this point means the evaluator
    // produced a completion kind that does not exist.
    throw new TypeError(
      `Unexpected ${completion.type} completion from a function body`,
    );
  }

  /**
   * Implements ECMA-262 13.2.2 `[[Construct]]`: build an object that
   * inherits from the function's `prototype` property (falling back to the
   * realm's `%Object.prototype%` when that property is not an object), run
   * the function with the new object as `this`, and keep the new object
   * unless the body returned an object of its own.
   *
   * @param {readonly unknown[]} [args=[]]
   * @returns {EngineObject}
   */
  constructFunction(args = []) {
    const prototypeProperty = this.get('prototype');
    const prototype =
      prototypeProperty instanceof EngineObject
        ? prototypeProperty
        : this.realm.intrinsics.objectPrototype;
    const instance = new EngineObject(prototype);
    const result = this.callFunction(instance, args);

    return result instanceof EngineObject ? result : instance;
  }

  /**
   * Implements the non-strict half of ECMA-262 10.4.3 "Entering Function
   * Code": `null`/`undefined` become the realm's global object and objects
   * are used as-is.
   *
   * A primitive `this` would be replaced by its `ToObject` wrapper, which
   * needs `String`/`Number`/`Boolean` objects this milestone does not
   * provide, so it is rejected explicitly. Guest code cannot reach that
   * branch yet — property access on a primitive base already rejects for
   * the same reason, and there is no `Function.prototype.call`/`apply` to
   * pass an arbitrary `this` — but embedders calling `callFunction`
   * directly can.
   *
   * @param {unknown} thisValue
   * @returns {unknown}
   */
  resolveThisValue(thisValue) {
    if (this.strict) {
      return thisValue;
    }

    if (thisValue === null || thisValue === undefined) {
      return this.realm.globalObject;
    }

    if (thisValue instanceof EngineObject) {
      return thisValue;
    }

    throw createUnsupportedOperationError(
      `ToObject on a ${typeof thisValue} this value`,
    );
  }
}

/**
 * The non-strict `arguments` object of ECMA-262 10.6. Indices that
 * correspond to a formal parameter stay *mapped* to that parameter's
 * binding: reading the index reads the binding, writing the index writes
 * the binding, and redefining the index as an accessor or as non-writable
 * breaks the mapping.
 *
 * The mapping lives in an internal parameter map rather than in accessor
 * descriptors, so the object's own properties stay observable as ordinary
 * writable data properties exactly as the specification requires.
 *
 * ES5 10.6 also unmaps an index on `delete arguments[i]`. That branch is
 * not implemented here because nothing can reach it: the `delete` operator
 * is an unsupported unary operator, this class is not part of the engine's
 * public surface, and no engine-internal caller deletes an arguments
 * property. It belongs with the task that implements `delete`, where it
 * can be driven by a test.
 */
export class ArgumentsObject extends EngineObject {
  /**
   * @param {EngineObject | null} prototype
   * @param {EnvironmentRecordLike} env
   */
  constructor(prototype, env) {
    super(prototype);

    /** @type {EnvironmentRecordLike} */
    this._environment = env;
    /** @type {Map<PropertyKey, string>} */
    this._parameterMap = new Map();
  }

  /**
   * @param {PropertyKey} name
   * @param {string} parameterName
   * @returns {void}
   */
  mapParameter(name, parameterName) {
    this._parameterMap.set(name, parameterName);
  }

  /**
   * @param {PropertyKey} name
   * @returns {import('./descriptors.js').PropertyDescriptorRecord | undefined}
   */
  getOwnProperty(name) {
    const descriptor = super.getOwnProperty(name);
    const parameterName = this._parameterMap.get(name);

    if (descriptor === undefined || parameterName === undefined) {
      return descriptor;
    }

    return {
      ...descriptor,
      value: this._environment.getBindingValue(parameterName, false),
    };
  }

  /**
   * @param {PropertyKey} name
   * @param {import('./descriptors.js').PropertyDescriptorRecord} descriptor
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  defineOwnProperty(name, descriptor, throwOnError = false) {
    const parameterName = this._parameterMap.get(name);
    const defined = super.defineOwnProperty(name, descriptor, throwOnError);

    if (!defined || parameterName === undefined) {
      return defined;
    }

    if (isAccessorDescriptor(descriptor)) {
      this._parameterMap.delete(name);
      return true;
    }

    if ('value' in descriptor) {
      this._environment.setMutableBinding(
        parameterName,
        descriptor.value,
        false,
      );
    }

    if (descriptor.writable === false) {
      this._parameterMap.delete(name);
    }

    return true;
  }
}

/**
 * Builds the `arguments` object for one activation (ECMA-262 10.6): a
 * `length` of the actual argument count, one index property per passed
 * argument, and a `callee` back-reference to the running function. Index
 * properties are walked from the last argument down so that duplicate
 * formal parameter names map to their *last* occurrence, matching the
 * specified `MakeArgGetter`/`MakeArgSetter` loop.
 *
 * @param {EngineFunction} functionObject
 * @param {readonly unknown[]} args
 * @param {EnvironmentRecordLike} env
 * @returns {ArgumentsObject}
 */
export function createArgumentsObject(functionObject, args, env) {
  const argumentsObject = new ArgumentsObject(
    functionObject.realm.intrinsics.objectPrototype,
    env,
  );

  argumentsObject.defineOwnProperty('length', {
    value: args.length,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  const parameterNames = functionObject.parameterNames;
  /** @type {Set<string>} */
  const mappedNames = new Set();

  for (let index = args.length - 1; index >= 0; index -= 1) {
    const key = String(index);

    argumentsObject.defineOwnProperty(key, {
      value: args[index],
      writable: true,
      enumerable: true,
      configurable: true,
    });

    if (functionObject.strict || index >= parameterNames.length) {
      continue;
    }

    const parameterName = parameterNames[index];

    if (!mappedNames.has(parameterName)) {
      mappedNames.add(parameterName);
      argumentsObject.mapParameter(key, parameterName);
    }
  }

  argumentsObject.defineOwnProperty('callee', {
    value: functionObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return argumentsObject;
}
