import { EngineObject } from './object.js';
import { isAccessorDescriptor } from './descriptors.js';
import { ThrowSignal, GuestErrorSignal } from './completion.js';
import { toObject } from './conversion.js';

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
 *   formalParameters: readonly any[],
 *   parameterNames: readonly string[],
 *   expectedArgumentCount: number,
 *   simpleParameterList: boolean,
 *   scope: EnvironmentRecordLike,
 *   strict: boolean,
 *   execute: FunctionBodyExecutor,
 *   name?: string,
 *   isMethod?: boolean,
 *   createPrototype?: boolean,
 *   functionKind?: 'normal' | 'arrow',
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
  constructor({
    realm,
    formalParameters,
    parameterNames,
    expectedArgumentCount,
    simpleParameterList,
    scope,
    strict,
    execute,
    name = '',
    isMethod = false,
    createPrototype = !isMethod,
    functionKind = 'normal',
  }) {
    super(realm.intrinsics.functionPrototype, 'Function');

    /** @type {Realm} */
    this.realm = realm;
    /** @type {readonly any[]} */
    this.formalParameters = formalParameters;
    /** @type {readonly string[]} */
    this.parameterNames = parameterNames;
    /** @type {number} */
    this.expectedArgumentCount = expectedArgumentCount;
    /** @type {boolean} */
    this.simpleParameterList = simpleParameterList;
    /** @type {EnvironmentRecordLike} */
    this.scope = scope;
    /** @type {boolean} */
    this.strict = strict;
    /** @type {boolean} */
    this._isConstructor = !isMethod;
    /** @type {'normal' | 'arrow'} */
    this.functionKind = functionKind;
    /** @type {FunctionBodyExecutor} */
    this._execute = execute;
    /** @type {EngineObject | undefined} */
    this.homeObject = undefined;

    this.defineOwnProperty('length', {
      value: expectedArgumentCount,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    this.defineOwnProperty('name', {
      value: name,
      writable: false,
      enumerable: false,
      configurable: true,
    });

    if (createPrototype) {
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

    // ECMA-262 13.2 strict-function-only steps: define non-configurable,
    // non-enumerable accessor properties for "caller" and "arguments" that
    // both read and write through the realm's shared %ThrowTypeError%
    // intrinsic. Non-strict functions have no such own properties, so
    // reading nonStrictFn.caller/.arguments returns undefined via ordinary
    // property lookup miss.
    if (strict) {
      const thrower = /** @type {EngineFunction | undefined} */ (
        realm.intrinsics.throwTypeErrorFunction
      );

      if (thrower === undefined) {
        // The realm always bootstraps %ThrowTypeError% before any function
        // is created, so a missing thrower indicates a broken realm setup.
        throw new TypeError(
          'Realm is missing required %ThrowTypeError% intrinsic',
        );
      }

      /** @type {import('./descriptors.js').PropertyDescriptorRecord} */
      const poisonPill = {
        get: thrower,
        set: thrower,
        enumerable: false,
        configurable: false,
      };
      this.defineOwnProperty('caller', poisonPill);
      this.defineOwnProperty('arguments', poisonPill);
    }
  }

  /**
   * @param {unknown} thisValue
   * @param {readonly unknown[]} [args=[]]
   * @returns {unknown}
   */
  callFunction(thisValue, args = []) {
    let completion;
    const guard = this.realm.stackGuard;

    // One guest activation, one frame in the realm's stack budget. The guard
    // raises its `RangeError` signal *before* the body builds an activation
    // environment, so the caller's boundary converts it into a catchable guest
    // error with a frame's worth of host stack to spare.
    guard.enter();

    try {
      completion = this._execute(this, this.resolveThisValue(thisValue), args);
    } catch (error) {
      if (error instanceof ThrowSignal) {
        throw error;
      }

      if (error instanceof GuestErrorSignal) {
        // Convert the pre-construction signal into a fully-built guest error
        // object and re-throw as a ThrowSignal so the evaluator's throw
        // machinery and try/catch handling can intercept it.
        throw new ThrowSignal(
          this.realm.createGuestError(error.typeName, error.guestMessage),
        );
      }

      throw error;
    } finally {
      guard.exit();
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
   * Implements ECMA-262 15.3.5.3 `[[HasInstance]]` (V): walks `V`'s
   * prototype chain looking for `F.prototype`. Returns `false` when `V` is
   * not an object; throws a guest `TypeError` when `F.prototype` is not an
   * object (spec-required check, guards against e.g. `F.prototype = 5`).
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  hasInstance(value) {
    if (!(value instanceof EngineObject)) {
      return false;
    }

    const proto = this.get('prototype');

    if (!(proto instanceof EngineObject)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Function has non-object prototype in instanceof check',
      );
    }

    let current = /** @type {EngineObject | null} */ (value.getPrototype());

    while (current !== null) {
      if (current === proto) {
        return true;
      }

      current = current.getPrototype();
    }

    return false;
  }

  /**
   * Implements the non-strict half of ECMA-262 10.4.3 "Entering Function
   * Code": `null`/`undefined` become the realm's global object and objects
   * are used as-is.
   *
   * Primitive values are boxed with realm-owned internal wrappers, preserving
   * ES5 `ToObject` behavior without requiring public `String`, `Number`, or
   * `Boolean` constructors.
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

    return toObject(this.realm, thisValue);
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
 * ES5 10.6 also unmaps an index on `delete arguments[i]`. This is implemented
 * in `ArgumentsObject.delete()` below: the override calls `super.delete()` to
 * remove the own property, then removes the corresponding entry from the
 * parameter map so the alias to the formal-parameter binding is severed.
 */
export class ArgumentsObject extends EngineObject {
  /**
   * @param {EngineObject | null} prototype
   * @param {EnvironmentRecordLike} env
   */
  constructor(prototype, env) {
    super(prototype, 'Arguments');

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
   * Overrides `_peekOwnDescriptor` to inject the live parameter-binding value
   * for mapped argument indices. When no mapping exists the raw stored
   * descriptor is returned without any copy (the common case). When a mapping
   * exists a new object is created so the stored descriptor is not mutated with
   * the live value — callers of `_peekOwnDescriptor` must not retain the
   * returned object across mutations regardless.
   *
   * @param {import('./descriptors.js').PropertyKey} name
   * @returns {import('./descriptors.js').CompletePropertyDescriptor | undefined}
   */
  _peekOwnDescriptor(name) {
    const raw = this._properties.get(name);
    if (raw === undefined) {
      return undefined;
    }
    const parameterName = this._parameterMap.get(name);
    if (parameterName === undefined) {
      return raw;
    }
    return {
      ...raw,
      value: this._environment.getBindingValue(parameterName, false),
    };
  }

  /**
   * @param {import('./descriptors.js').PropertyKey} name
   * @returns {import('./descriptors.js').CompletePropertyDescriptor | undefined}
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
   * Extends the base `[[Delete]]` to unmap a parameter binding when the
   * corresponding index property is deleted (ECMA-262 10.6 step 14.c.iii).
   * Without this, deleting `arguments[0]` would remove the own property but
   * leave the mapping alive, so subsequent writes to `arguments[0]` would
   * still reach the parameter binding even though the index is no longer
   * present.
   *
   * @param {PropertyKey} name
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  delete(name, throwOnError = false) {
    const deleted = super.delete(name, throwOnError);

    if (deleted) {
      this._parameterMap.delete(name);
    }

    return deleted;
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
 * argument. A mapped object receives a `callee` back-reference; an unmapped
 * object receives the ES2015 poison pill instead. Index properties are walked
 * from the last argument down so duplicate formal names map only their *last*
 * occurrence, matching the specified `MakeArgGetter`/`MakeArgSetter` loop.
 *
 * @param {EngineFunction} functionObject
 * @param {readonly unknown[]} args
 * @param {EnvironmentRecordLike} env
 * @param {boolean} mapped
 * @returns {ArgumentsObject}
 */
export function createArgumentsObject(functionObject, args, env, mapped) {
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

  for (let index = args.length - 1; index >= 0; index -= 1) {
    const key = String(index);

    argumentsObject.defineOwnProperty(key, {
      value: args[index],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  if (mapped) {
    const parameterNames = functionObject.parameterNames;
    /** @type {Set<string>} */
    const mappedNames = new Set();

    for (let index = parameterNames.length - 1; index >= 0; index -= 1) {
      const parameterName = parameterNames[index];

      if (mappedNames.has(parameterName)) {
        continue;
      }

      mappedNames.add(parameterName);

      if (index < args.length) {
        argumentsObject.mapParameter(String(index), parameterName);
      }
    }
  }

  if (!mapped) {
    // ES2015 §9.4.4.6: unmapped arguments objects use the realm's shared
    // %ThrowTypeError% intrinsic for their legacy poison-pill properties.
    const thrower = /** @type {EngineFunction | undefined} */ (
      functionObject.realm.intrinsics.throwTypeErrorFunction
    );

    if (thrower === undefined) {
      // The realm always bootstraps %ThrowTypeError% before any function
      // is created, so a missing thrower indicates a broken realm setup.
      throw new TypeError(
        'Realm is missing required %ThrowTypeError% intrinsic',
      );
    }

    /** @type {import('./descriptors.js').PropertyDescriptorRecord} */
    const poisonPill = {
      get: thrower,
      set: thrower,
      enumerable: false,
      configurable: false,
    };
    argumentsObject.defineOwnProperty('callee', poisonPill);

    // Preserve the engine's ES5 strict-arguments `caller` poison pill without
    // adding that legacy property to sloppy non-simple arguments objects.
    if (functionObject.strict) {
      argumentsObject.defineOwnProperty('caller', poisonPill);
    }
  } else {
    argumentsObject.defineOwnProperty('callee', {
      value: functionObject,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  // ES2015 §9.4.4.7 step 17 (mapped) / §9.4.4.6 step 15 (unmapped): every
  // arguments object gets an `@@iterator` data property whose value is the
  // intrinsic %Array.prototype.values%, so `for (x of arguments)` works.
  const iteratorSymbol = functionObject.realm.agent.wellKnownSymbols.iterator;
  argumentsObject.defineOwnProperty(iteratorSymbol, {
    value: functionObject.realm.intrinsics.arrayPrototype.get(iteratorSymbol),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return argumentsObject;
}
