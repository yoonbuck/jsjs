import { EngineObject } from './object.js';
import { isAccessorDescriptor, isConstructor } from './descriptors.js';
import { ThrowSignal, GuestErrorSignal } from './completion.js';
import { toObject } from './conversion.js';
import {
  bindThisValue,
  createFunctionExecutionEnvironment,
} from './environment.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 * @typedef {import('./realm.js').Realm} Realm
 * @typedef {import('./environment.js').EnvironmentRecordLike} EnvironmentRecordLike
 * @typedef {{ type: string, value: unknown }} Completion
 * @typedef {'normal' | 'method' | 'arrow' | 'classConstructor'
 *   | 'generator' | 'generatorMethod'} FunctionKind
 *
 * @typedef {(
 *   functionObject: EngineFunction,
 *   thisValue: unknown,
 *   args: readonly unknown[],
 *   functionEnvironment: import('./environment.js').FunctionExecutionEnvironment,
 * ) => Completion} FunctionBodyExecutor
 *
 * @typedef {(
 *   functionObject: EngineFunction,
 *   thisValue: unknown,
 *   args: readonly unknown[],
 *   functionEnvironment: import('./environment.js').FunctionExecutionEnvironment,
 * ) => import('./generator-object.js').GeneratorObject} GeneratorFactory
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
 *   functionKind?: FunctionKind,
 *   thisMode?: 'global' | 'strict' | 'lexical',
 *   constructible?: boolean,
 *   enclosingFunctionEnvironment?: import('./environment.js').FunctionExecutionEnvironment,
 *   methodHomeObject?: EngineObject,
 *   constructorKind?: 'base' | 'derived' | undefined,
 *   defaultDerivedConstructor?: boolean,
 *   functionObjectPrototype?: EngineObject,
 *   prototypeObjectPrototype?: EngineObject,
 *   generatorFactory?: GeneratorFactory,
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
    functionKind = isMethod ? 'method' : 'normal',
    thisMode = functionKind === 'arrow'
      ? 'lexical'
      : strict
        ? 'strict'
        : 'global',
    constructible = functionKind === 'normal' ||
      functionKind === 'classConstructor',
    createPrototype = constructible ||
      functionKind === 'generator' ||
      functionKind === 'generatorMethod',
    enclosingFunctionEnvironment = undefined,
    methodHomeObject = undefined,
    constructorKind = undefined,
    defaultDerivedConstructor = false,
    functionObjectPrototype = undefined,
    prototypeObjectPrototype = undefined,
    generatorFactory = undefined,
  }) {
    super(
      functionObjectPrototype ?? realm.intrinsics.functionPrototype,
      'Function',
    );

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
    this._isConstructor = constructible;
    /** @type {FunctionKind} */
    this.functionKind = functionKind;
    /** @type {'global' | 'strict' | 'lexical'} */
    this.thisMode = thisMode;
    /** @type {import('./environment.js').FunctionExecutionEnvironment | undefined} */
    this.enclosingFunctionEnvironment = enclosingFunctionEnvironment;
    /** @type {FunctionBodyExecutor} */
    this._execute = execute;
    /** @type {GeneratorFactory | undefined} */
    this._generatorFactory = generatorFactory;
    /** @type {'base' | 'derived' | undefined} */
    this.constructorKind = constructorKind;
    /** @type {boolean} */
    this.defaultDerivedConstructor = defaultDerivedConstructor;

    if (methodHomeObject !== undefined && functionKind !== 'arrow') {
      this.methodHomeObject = methodHomeObject;
    }

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
      const prototype = new EngineObject(
        prototypeObjectPrototype ?? realm.intrinsics.objectPrototype,
      );

      if (functionKind !== 'generator' && functionKind !== 'generatorMethod') {
        prototype.defineOwnProperty('constructor', {
          value: this,
          writable: true,
          enumerable: false,
          configurable: true,
        });
      }

      this.defineOwnProperty('prototype', {
        value: prototype,
        writable: true,
        enumerable: false,
        configurable: false,
      });
    }

    // Strict ordinary functions retain own poison accessors, while sloppy
    // ordinary functions retain writable data extensions that shadow the
    // restricted accessors inherited from %Function.prototype%. Methods,
    // arrows, and class constructors omit both own properties.
    if (strict && functionKind === 'normal') {
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
    } else if (functionKind === 'normal') {
      const extension = {
        value: undefined,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      this.defineOwnProperty('caller', extension);
      this.defineOwnProperty('arguments', extension);
    }
  }

  /**
   * @param {unknown} thisValue
   * @param {readonly unknown[]} [args=[]]
   * @returns {unknown}
   */
  callFunction(thisValue, args = []) {
    if (this.functionKind === 'classConstructor') {
      throw new ThrowSignal(
        this.realm.createGuestError(
          'TypeError',
          "Class constructor cannot be invoked without 'new'",
        ),
      );
    }

    const functionEnvironment = this.functionExecutionEnvironment(thisValue);

    if (
      this.functionKind === 'generator' ||
      this.functionKind === 'generatorMethod'
    ) {
      const generatorFactory = this._generatorFactory;

      if (generatorFactory === undefined) {
        throw new TypeError(
          'Generator function is missing a generator factory',
        );
      }

      const completion = this.executeWithFunctionEnvironment(
        functionEnvironment.thisValue,
        args,
        functionEnvironment,
        (functionObject, resolvedThisValue, receivedArgs, environment) => ({
          type: 'return',
          value: generatorFactory(
            functionObject,
            resolvedThisValue,
            receivedArgs,
            environment,
          ),
        }),
      );

      if (completion.type === 'return') {
        return completion.value;
      }

      throw new TypeError(
        'Generator factory returned an unexpected function completion',
      );
    }

    const completion = this.executeWithFunctionEnvironment(
      functionEnvironment.thisValue,
      args,
      functionEnvironment,
    );

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
   * @returns {import('./function-realm.js').JobCompletion}
   */
  getFunctionRealm() {
    return { type: 'normal', value: this.realm };
  }

  /**
   * Implements ordinary and class `[[Construct]]`. Ordinary functions allocate
   * through the supplied `newTarget`; class base constructors bind that
   * allocation before their body, while derived constructors defer binding until
   * `super(...)` initializes it.
   *
   * @param {readonly unknown[]} [args=[]]
   * @param {unknown} [newTarget=this]
   * @returns {EngineObject}
   */
  constructFunction(args = [], newTarget = this) {
    if (!this._isConstructor) {
      throw new GuestErrorSignal('TypeError', 'Function is not a constructor');
    }

    if (this.functionKind === 'classConstructor') {
      return this.constructClass(args, newTarget);
    }

    const instance = ordinaryCreateFromConstructor(
      newTarget,
      this.realm.intrinsics.objectPrototype,
      this.realm.agent,
    );
    const result = this.callFunction(instance, args);

    return result instanceof EngineObject ? result : instance;
  }

  /**
   * @param {unknown} thisValue
   * @returns {import('./environment.js').FunctionExecutionEnvironment}
   */
  functionExecutionEnvironment(thisValue) {
    if (this.thisMode === 'lexical') {
      if (this.enclosingFunctionEnvironment === undefined) {
        throw new GuestErrorSignal(
          'ReferenceError',
          'This binding is not available',
        );
      }

      return this.enclosingFunctionEnvironment;
    }

    return createFunctionExecutionEnvironment({
      outer: this.enclosingFunctionEnvironment,
      thisStatus: 'initialized',
      thisValue: this.resolveThisValue(thisValue),
      homeObject: this.methodHomeObject,
    });
  }

  /**
   * @param {unknown} thisValue
   * @param {readonly unknown[]} args
   * @param {import('./environment.js').FunctionExecutionEnvironment} functionEnvironment
   * @param {FunctionBodyExecutor} [execute=this._execute]
   * @returns {Completion}
   */
  executeWithFunctionEnvironment(
    thisValue,
    args,
    functionEnvironment,
    execute = this._execute,
  ) {
    const guard = this.realm.stackGuard;
    guard.enter();

    try {
      return execute(this, thisValue, args, functionEnvironment);
    } catch (error) {
      if (error instanceof ThrowSignal) {
        throw error;
      }

      if (error instanceof GuestErrorSignal) {
        throw new ThrowSignal(
          this.realm.createGuestError(error.typeName, error.guestMessage),
        );
      }

      throw error;
    } finally {
      guard.exit();
    }
  }

  /**
   * @param {readonly unknown[]} args
   * @param {unknown} newTarget
   * @returns {EngineObject}
   */
  constructClass(args, newTarget) {
    const derived = this.constructorKind === 'derived';
    const instance = derived
      ? undefined
      : ordinaryCreateFromConstructor(
          newTarget,
          this.realm.intrinsics.objectPrototype,
          this.realm.agent,
        );
    const functionEnvironment = createFunctionExecutionEnvironment({
      outer: this.enclosingFunctionEnvironment,
      thisStatus: derived ? 'uninitialized' : 'initialized',
      thisValue: instance,
      newTarget,
      homeObject: this.methodHomeObject,
      activeConstructor: derived ? this : undefined,
    });
    const completion = this.defaultDerivedConstructor
      ? this.executeWithFunctionEnvironment(
          undefined,
          args,
          functionEnvironment,
          (_functionObject, _thisValue, values, environment) => {
            constructSuper(values, environment);
            return { type: 'normal', value: undefined };
          },
        )
      : this.executeWithFunctionEnvironment(
          instance,
          args,
          functionEnvironment,
        );

    if (completion.type === 'throw') {
      throw new ThrowSignal(completion.value);
    }

    if (completion.type !== 'normal' && completion.type !== 'return') {
      throw new TypeError(
        `Unexpected ${completion.type} completion from a class constructor body`,
      );
    }

    const value = completion.type === 'return' ? completion.value : undefined;

    if (!derived) {
      return value instanceof EngineObject
        ? value
        : /** @type {EngineObject} */ (instance);
    }

    if (value instanceof EngineObject) {
      return value;
    }

    if (value !== undefined) {
      throw new ThrowSignal(
        this.realm.createGuestError(
          'TypeError',
          'Derived constructors may only return object or undefined values',
        ),
      );
    }

    if (functionEnvironment.thisStatus !== 'initialized') {
      throw new ThrowSignal(
        this.realm.createGuestError(
          'ReferenceError',
          "Must call super constructor in derived class before accessing 'this'",
        ),
      );
    }

    return /** @type {EngineObject} */ (functionEnvironment.thisValue);
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
    if (this.thisMode === 'strict') {
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
 * Allocates an ordinary object from `newTarget.prototype`, falling back to the
 * realm's intrinsic object prototype when the property is not an engine object.
 *
 * @param {unknown} newTarget
 * @param {EngineObject} fallbackPrototype
 * @param {import('./agent.js').Agent} agent
 * @returns {EngineObject}
 */
function ordinaryCreateFromConstructor(newTarget, fallbackPrototype, agent) {
  const candidate =
    newTarget instanceof EngineObject ? newTarget.get('prototype') : undefined;
  const prototype =
    candidate instanceof EngineObject ? candidate : fallbackPrototype;
  return new EngineObject(prototype, 'Object', agent);
}

/**
 * Implements the shared runtime portion of a derived constructor's `super(...)`
 * evaluation. The evaluator expands arguments first; this helper reads the
 * currently executing derived constructor's current prototype, constructs it
 * with the active new target, and binds the resulting `this` exactly once.
 *
 * @param {readonly unknown[]} args
 * @param {import('./environment.js').FunctionExecutionEnvironment} functionEnvironment
 * @returns {unknown}
 */
export function constructSuper(args, functionEnvironment) {
  const superConstructor =
    functionEnvironment.activeConstructor?.getPrototype();

  if (!isConstructor(superConstructor)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Super constructor is not a constructor',
    );
  }

  const value = superConstructor.constructFunction(
    args,
    functionEnvironment.newTarget,
  );
  return bindThisValue(functionEnvironment, value);
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
    // %ThrowTypeError% intrinsic for their `callee` poison-pill property.
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
  const arrayValuesFunction =
    /** @type {import('../builtins/shared.js').NativeFunction | undefined} */ (
      functionObject.realm.intrinsics.arrayValuesFunction
    );

  if (arrayValuesFunction === undefined) {
    throw new TypeError(
      'Realm is missing required %Array.prototype.values% intrinsic',
    );
  }

  argumentsObject.defineOwnProperty(iteratorSymbol, {
    value: arrayValuesFunction,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return argumentsObject;
}
