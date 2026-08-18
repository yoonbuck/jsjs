import { isCallable, isConstructor } from '../runtime/descriptors.js';
import { GuestErrorSignal, ThrowSignal } from '../runtime/completion.js';
import { EngineObject } from '../runtime/object.js';
import { toBoolean, toUint32 } from '../runtime/conversion.js';

/**
 * @typedef {import('../runtime/descriptors.js').CallableLike} CallableLike
 * @typedef {import('../runtime/descriptors.js').PropertyDescriptorRecord} PropertyDescriptorRecord
 * @typedef {import('../runtime/realm.js').Realm} Realm
 *
 * @typedef {{
 *   name: string,
 *   length: number,
 *   call: (
 *     thisValue: unknown,
 *     args: readonly unknown[],
 *     functionObject: NativeFunction,
 *     callerRealm?: Realm,
 *   ) => unknown,
 *   construct?: ((
 *     args: readonly unknown[],
 *     functionObject: NativeFunction,
 *     newTarget: unknown,
 *     callerRealm?: Realm,
 *   ) => EngineObject) | undefined,
 *   prototype?: EngineObject | undefined,
 *   retargetConstructionResult?: boolean,
 *   generatorResume?: boolean,
 * }} NativeFunctionOptions
 */

/**
 * A built-in callable owned by one realm. Native functions use host callbacks
 * for their algorithm bodies while still presenting guest-visible function
 * objects with realm-local identity, descriptors, and error conversion.
 */
export class NativeFunction extends EngineObject {
  /**
   * @param {Realm} realm
   * @param {NativeFunctionOptions} options
   */
  constructor(
    realm,
    {
      name,
      length,
      call,
      construct,
      prototype,
      retargetConstructionResult = true,
      generatorResume = false,
    },
  ) {
    super(realm.intrinsics.functionPrototype, 'Function');

    /** @type {Realm} */
    this.realm = realm;
    /** @type {NativeFunctionOptions['call']} */
    this._call = call;
    /** @type {NativeFunctionOptions['construct']} */
    this._construct = construct;
    /** @type {string} */
    this._nativeName = name;
    /** @type {boolean} */
    this._isConstructor = construct !== undefined;
    /** @type {boolean} */
    this._retargetConstructionResult = retargetConstructionResult;
    /** @type {boolean} */
    this._generatorResume = generatorResume;

    this.defineOwnProperty('length', {
      value: length,
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

    if (prototype instanceof EngineObject) {
      this.defineOwnProperty('prototype', {
        value: prototype,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
  }

  /**
   * @param {unknown} thisValue
   * @param {readonly unknown[]} [args=[]]
   * @param {Realm} [callerRealm]
   * @returns {unknown}
   */
  callFunction(thisValue, args = [], callerRealm) {
    const guard = this.realm.stackGuard;
    const methodAgent = this.realm.agent;
    const callChain = methodAgent.enterSynchronousCallChain(callerRealm?.agent);

    try {
      const hostChainReference = this._generatorResume
        ? methodAgent.enterGeneratorHostChainReference(
            Math.min(
              guard.maxDepth,
              callerRealm?.stackGuard.maxDepth ?? Number.POSITIVE_INFINITY,
            ),
          )
        : null;

      try {
        callerRealm?.agent.linkGeneratorHostChain(methodAgent);

        if (
          this._generatorResume &&
          thisValue instanceof EngineObject &&
          thisValue.agent !== null
        ) {
          methodAgent.linkGeneratorHostChain(thisValue.agent);
        }

        const activeRealm = callerRealm ?? this.realm;

        linkCallResult(activeRealm, thisValue);
        for (const argument of args) {
          linkCallResult(activeRealm, argument);
        }

        // Built-ins enter the realm's stack budget exactly like guest functions
        // do, so a recursion that threads through `[].map`, a getter, or a
        // coercion is measured by the host frames it really spends.
        guard.enter();

        try {
          const result = runNativeBody(this.realm, () =>
            this._call(thisValue, args, this, callerRealm),
          );

          linkCallResult(callerRealm ?? this.realm, result);
          return result;
        } finally {
          guard.exit();
        }
      } finally {
        if (hostChainReference !== null) {
          methodAgent.exitGeneratorHostChainReference(hostChainReference);
        }
      }
    } finally {
      methodAgent.exitSynchronousCallChain(callChain);
    }
  }

  /**
   * @returns {import('../runtime/function-realm.js').JobCompletion}
   */
  getFunctionRealm() {
    return { type: 'normal', value: this.realm };
  }

  /**
   * @param {readonly unknown[]} [args=[]]
   * @param {unknown} [newTarget=this]
   * @param {Realm} [callerRealm]
   * @returns {unknown}
   */
  constructFunction(args = [], newTarget = this, callerRealm) {
    const methodAgent = this.realm.agent;
    const callChain = methodAgent.enterSynchronousCallChain(callerRealm?.agent);

    try {
      callerRealm?.agent.linkGeneratorHostChain(methodAgent);
      const activeRealm = callerRealm ?? this.realm;

      for (const argument of args) {
        linkCallResult(activeRealm, argument);
      }
      linkCallResult(activeRealm, newTarget);

      const construct = this._construct;

      if (construct === undefined) {
        throw new ThrowSignal(
          this.realm.createGuestError(
            'TypeError',
            `${this._nativeName || 'Function'} is not a constructor`,
          ),
        );
      }

      const guard = this.realm.stackGuard;

      guard.enter();

      /** @type {unknown} */
      let result;

      try {
        result = runNativeBody(this.realm, () =>
          construct(args, this, newTarget, callerRealm),
        );
      } finally {
        guard.exit();
      }

      if (!(result instanceof EngineObject)) {
        throw new TypeError('Native constructor must return an object');
      }

      if (this._retargetConstructionResult) {
        setNativeConstructionPrototype(result, this, newTarget);
      }

      linkCallResult(activeRealm, result);
      return result;
    } finally {
      methodAgent.exitSynchronousCallChain(callChain);
    }
  }

  /**
   * @param {unknown} value
   * @returns {boolean}
   */
  hasInstance(value) {
    if (!(value instanceof EngineObject)) {
      return false;
    }

    const prototype = this.get('prototype');

    if (!(prototype instanceof EngineObject)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Function has non-object prototype in instanceof check',
      );
    }

    let current = /** @type {EngineObject | null} */ (value.getPrototype());

    while (current !== null) {
      if (current === prototype) {
        return true;
      }

      current = current.getPrototype();
    }

    return false;
  }
}

/**
 * @param {Realm} callerRealm
 * @param {unknown} result
 * @returns {void}
 */
function linkCallResult(callerRealm, result) {
  if (result instanceof EngineObject && result.agent !== null) {
    callerRealm.agent.linkGeneratorHostChain(result.agent);
  }
}

/**
 * Native constructors retain their own allocation algorithms, but ordinary
 * built-ins such as Object and Array create an object from their intrinsic
 * prototype. When such a constructor is reached through `super(...)`, move that
 * fresh allocation onto the active new target's prototype just as
 * OrdinaryCreateFromConstructor would. An explicit native return object whose
 * prototype does not match the native constructor remains untouched.
 *
 * @param {EngineObject} result
 * @param {NativeFunction} constructor
 * @param {unknown} newTarget
 * @returns {void}
 */
function setNativeConstructionPrototype(result, constructor, newTarget) {
  if (
    newTarget === constructor ||
    !(newTarget instanceof EngineObject) ||
    result.getPrototype() !== constructor.get('prototype')
  ) {
    return;
  }

  const prototype = newTarget.get('prototype');

  if (prototype instanceof EngineObject) {
    result.setPrototypeOf(prototype);
  }
}

/**
 * @param {Realm} realm
 * @param {NativeFunctionOptions} options
 * @returns {NativeFunction}
 */
export function createNativeFunction(realm, options) {
  return new NativeFunction(realm, options);
}

/**
 * @template {CallableLike} T
 * @param {unknown} value
 * @param {string} message
 * @returns {T}
 */
export function requireCallable(value, message) {
  if (!isCallable(value)) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return /** @type {T} */ (value);
}

/**
 * @template {CallableLike & { constructFunction: (args?: readonly unknown[], newTarget?: unknown) => unknown }} T
 * @param {unknown} value
 * @param {string} message
 * @returns {T}
 */
export function requireConstructor(value, message) {
  if (!isConstructor(value)) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return /** @type {T} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {EngineObject}
 */
export function requireObjectReceiver(value, message) {
  if (!(value instanceof EngineObject)) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return value;
}

/**
 * Implements ES5 8.10.5 `ToPropertyDescriptor`.
 *
 * @param {unknown} value
 * @returns {PropertyDescriptorRecord}
 */
export function toPropertyDescriptor(value) {
  const object = requireObjectReceiver(
    value,
    'Property description must be an object',
  );
  /** @type {PropertyDescriptorRecord} */
  const descriptor = {};

  if (object.hasProperty('enumerable')) {
    descriptor.enumerable = toBoolean(object.get('enumerable'));
  }

  if (object.hasProperty('configurable')) {
    descriptor.configurable = toBoolean(object.get('configurable'));
  }

  if (object.hasProperty('value')) {
    descriptor.value = object.get('value');
  }

  if (object.hasProperty('writable')) {
    descriptor.writable = toBoolean(object.get('writable'));
  }

  if (object.hasProperty('get')) {
    const getter = object.get('get');

    if (getter !== undefined) {
      requireCallable(getter, 'Getter must be callable or undefined');
    }

    descriptor.get = /** @type {CallableLike | undefined} */ (getter);
  }

  if (object.hasProperty('set')) {
    const setter = object.get('set');

    if (setter !== undefined) {
      requireCallable(setter, 'Setter must be callable or undefined');
    }

    descriptor.set = /** @type {CallableLike | undefined} */ (setter);
  }

  if (
    ('get' in descriptor || 'set' in descriptor) &&
    ('value' in descriptor || 'writable' in descriptor)
  ) {
    throw new GuestErrorSignal(
      'TypeError',
      'Property descriptor cannot be both data and accessor',
    );
  }

  return descriptor;
}

/**
 * Implements ES5 8.10.4 `FromPropertyDescriptor`.
 *
 * @param {Realm} realm
 * @param {PropertyDescriptorRecord | undefined} descriptor
 * @returns {EngineObject | undefined}
 */
export function fromPropertyDescriptor(realm, descriptor) {
  if (descriptor === undefined) {
    return undefined;
  }

  const object = new EngineObject(realm.intrinsics.objectPrototype);

  if ('value' in descriptor || 'writable' in descriptor) {
    defineDescriptorField(object, 'value', descriptor.value);
    defineDescriptorField(object, 'writable', Boolean(descriptor.writable));
  } else if ('get' in descriptor || 'set' in descriptor) {
    defineDescriptorField(object, 'get', descriptor.get);
    defineDescriptorField(object, 'set', descriptor.set);
  }

  defineDescriptorField(object, 'enumerable', Boolean(descriptor.enumerable));
  defineDescriptorField(
    object,
    'configurable',
    Boolean(descriptor.configurable),
  );

  return object;
}

/**
 * @param {unknown} value
 * @param {{ preserveHoles?: boolean }} [options]
 * @returns {unknown[]}
 */
export function createListFromArrayLike(value, options = {}) {
  const object = requireObjectReceiver(
    value,
    'Array-like value must be an object',
  );
  const preserveHoles = options.preserveHoles === true;
  const length = toUint32(object.get('length'));
  const list = new Array(length);

  for (let index = 0; index < length; index += 1) {
    const name = String(index);

    if (preserveHoles && !object.hasProperty(name)) {
      continue;
    }

    list[index] = object.get(name);
  }

  return list;
}

/**
 * @param {Realm} realm
 * @param {() => unknown} body
 * @returns {unknown}
 */
function runNativeBody(realm, body) {
  try {
    return body();
  } catch (error) {
    if (error instanceof ThrowSignal) {
      throw error;
    }

    if (error instanceof GuestErrorSignal) {
      throw new ThrowSignal(
        realm.createGuestError(error.typeName, error.guestMessage),
      );
    }

    throw error;
  }
}

/**
 * @param {EngineObject} object
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineDescriptorField(object, name, value) {
  object.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
