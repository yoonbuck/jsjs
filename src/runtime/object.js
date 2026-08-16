import {
  completePropertyDescriptor,
  copyPropertyDescriptor,
  isAccessorDescriptor,
  isCallable,
  isDataDescriptor,
  validatePropertyDescriptor,
} from './descriptors.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').CompletePropertyDescriptor} CompletePropertyDescriptor
 * @typedef {import('./descriptors.js').PropertyDescriptorRecord} PropertyDescriptorRecord
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 */

export class EngineObject {
  /**
   * @param {EngineObject | null} [prototype=null]
   * @param {string} [className='Object']
   * @param {import('./agent.js').Agent | null} [agent=null] The agent whose
   *   well-known symbols this object's conversions use. Left unset it is
   *   inherited from `prototype`, which is how every ordinary object gets one:
   *   the chain bottoms out at a realm's `%Object.prototype%`. Only the two
   *   places that build a null-prototype object — `createFundamentalIntrinsics`
   *   and `Object.create(null)` — have to pass it, and both know their realm.
   */
  constructor(prototype = null, className = 'Object', agent = null) {
    if (prototype !== null && !(prototype instanceof EngineObject)) {
      throw new TypeError(
        'EngineObject prototype must be an EngineObject or null',
      );
    }

    this._prototype = prototype;
    this._className = className;
    this._extensible = true;
    /** @type {import('./agent.js').Agent | null} */
    this.agent = agent ?? (prototype === null ? null : prototype.agent);
    /** @type {Map<PropertyKey, CompletePropertyDescriptor>} */
    this._properties = new Map();
  }

  /**
   * @returns {string}
   */
  getClassName() {
    return this._className;
  }

  /**
   * @returns {EngineObject | null}
   */
  getPrototype() {
    return this._prototype;
  }

  /**
   * @returns {boolean}
   */
  isExtensible() {
    return this._extensible;
  }

  /**
   * @returns {EngineObject}
   */
  preventExtensions() {
    this._extensible = false;
    return this;
  }

  /**
   * Implements ECMA-262 9.1.2 `OrdinarySetPrototypeOf`: same-value is a
   * trivial success, a non-null non-object candidate or a non-extensible
   * receiver rejects, and a candidate that would introduce a cycle (walking
   * its own prototype chain and finding `this`) rejects too. Otherwise
   * replaces `_prototype`.
   *
   * @param {EngineObject | null} value
   * @returns {boolean}
   */
  setPrototypeOf(value) {
    if (value === this._prototype) {
      return true;
    }

    if (value !== null && !(value instanceof EngineObject)) {
      return false;
    }

    if (!this._extensible) {
      return false;
    }

    for (
      let current = /** @type {EngineObject | null} */ (value);
      current !== null;
      current = current.getPrototype()
    ) {
      if (current === this) {
        return false;
      }
    }

    this._prototype = value;
    return true;
  }

  /**
   * Implements ECMA-262 9.1.12 `OrdinaryOwnPropertyKeys`'s key order: every
   * array-index string key first, in ascending numeric order, then every
   * remaining string key in creation order, then every symbol key in creation
   * order. ES5 left this order implementation-defined; ES2015 fixed it, and
   * reflection, `for-in`, and `JSON.stringify` all read through this method.
   * The latter two buckets need no extra sort: a `Map` already iterates in
   * insertion order, so filtering it preserves each key kind's relative
   * creation order.
   *
   * @returns {PropertyKey[]}
   */
  ownPropertyKeys() {
    /** @type {string[]} */
    const indexKeys = [];
    /** @type {string[]} */
    const stringKeys = [];
    /** @type {symbol[]} */
    const symbolKeys = [];

    for (const key of this._properties.keys()) {
      if (typeof key === 'symbol') {
        symbolKeys.push(key);
      } else if (isArrayIndexKey(key)) {
        indexKeys.push(key);
      } else {
        stringKeys.push(key);
      }
    }

    indexKeys.sort((left, right) => Number(left) - Number(right));

    return [...indexKeys, ...stringKeys, ...symbolKeys];
  }

  /**
   * Returns the stored `CompletePropertyDescriptor` directly — no copy.
   * Callers must treat the returned object as read-only and must not retain
   * it across any operation that could mutate `_properties` (define, delete,
   * put). Subclasses that synthesise virtual properties (e.g. `ArgumentsObject`)
   * override this to match their `getOwnProperty` semantics while still
   * avoiding the copy on the common case.
   *
   * @param {PropertyKey} name
   * @returns {CompletePropertyDescriptor | undefined}
   */
  _peekOwnDescriptor(name) {
    return this._properties.get(name);
  }

  /**
   * @param {PropertyKey} name
   * @returns {CompletePropertyDescriptor | undefined}
   */
  getOwnProperty(name) {
    const descriptor = this._peekOwnDescriptor(name);
    return descriptor === undefined
      ? undefined
      : /** @type {CompletePropertyDescriptor} */ (
          copyPropertyDescriptor(descriptor)
        );
  }

  /**
   * Walks the prototype chain iteratively rather than recursively: guest code
   * can lengthen a chain at runtime (`o = Object.create(o)` in a loop), so a
   * frame per link would let an ordinary property read exhaust the host stack.
   * Chain length is not recursion, and it does not spend the realm's stack
   * budget (`src/runtime/stack-guard.js`).
   *
   * @param {PropertyKey} name
   * @returns {PropertyDescriptorRecord | undefined}
   */
  getProperty(name) {
    /** @type {EngineObject | null} */
    let current = this;

    while (current !== null) {
      const own = current._peekOwnDescriptor(name);

      if (own !== undefined) {
        return copyPropertyDescriptor(own);
      }

      current = current._prototype;
    }

    return undefined;
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasProperty(name) {
    return this.getProperty(name) !== undefined;
  }

  /**
   * @param {PropertyKey} name
   * @returns {unknown}
   */
  get(name) {
    const descriptor = this.getProperty(name);

    if (descriptor === undefined) {
      return undefined;
    }

    if (isDataDescriptor(descriptor)) {
      return descriptor.value;
    }

    return descriptor.get === undefined
      ? undefined
      : callAccessor(descriptor.get, this, []);
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  canPut(name) {
    const own = this._peekOwnDescriptor(name);

    if (own !== undefined) {
      return isAccessorDescriptor(own)
        ? own.set !== undefined
        : Boolean(own.writable);
    }

    if (this._prototype === null) {
      return this._extensible;
    }

    const inherited = this._prototype.getProperty(name);

    if (inherited === undefined) {
      return this._extensible;
    }

    if (isAccessorDescriptor(inherited)) {
      return inherited.set !== undefined;
    }

    return this._extensible && Boolean(inherited.writable);
  }

  /**
   * Implements ECMA-262 `OrdinarySet`/`OrdinarySetWithOwnDescriptor`: assigns
   * `value` for `name` as seen from `this` object, but creates or updates the
   * property on `receiver` rather than on whichever object in the prototype
   * chain actually owns the descriptor that governs the assignment. This is
   * what makes an inherited writable data property "shadow" onto the
   * original receiver (`o.inherited = 1` adds an own property to `o` even
   * though `inherited` lives on `o`'s prototype) while an inherited setter
   * still runs against that original receiver instead of the object partway
   * up the chain where the setter happens to be defined.
   *
   * The prototype walk is iterative for the same reason `getProperty` is:
   * guest code can lengthen an ordinary prototype chain at runtime, and a
   * host frame per link would let a long enough chain exhaust the host stack
   * on a plain assignment. Recursion is reserved for the boundary where an
   * object's own `set` is not this ordinary implementation — an exotic
   * object (for example a future namespace object) governs its own lookup,
   * and there can only be as many of those in a chain as guest code
   * deliberately constructs, unlike chain length itself.
   *
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {unknown} receiver
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  set(name, value, receiver, throwOnError = false) {
    /** @type {EngineObject | null} */
    let current = this;

    while (current !== null) {
      const own = current._peekOwnDescriptor(name);

      if (own !== undefined) {
        return setWithOwnDescriptor(
          name,
          own,
          current === receiver,
          value,
          receiver,
          throwOnError,
        );
      }

      /** @type {EngineObject | null} */
      const proto = current._prototype;

      if (proto === null) {
        return setWithOwnDescriptor(
          name,
          IMPLICIT_DATA_DESCRIPTOR,
          false,
          value,
          receiver,
          throwOnError,
        );
      }

      if (proto.set !== EngineObject.prototype.set) {
        // `proto` overrides `set` with exotic semantics (not yet the case
        // for any built-in, but reserved for future exotic objects): defer
        // to it rather than assuming its own-property lookup is ordinary.
        return proto.set(name, value, receiver, throwOnError);
      }

      current = proto;
    }

    // Unreachable: the loop above always returns before `current` becomes
    // null without first taking the `proto === null` branch.
    return false;
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  put(name, value, throwOnError = false) {
    return this.set(name, value, this, throwOnError);
  }

  /**
   * @param {PropertyKey} name
   * @param {PropertyDescriptorRecord} descriptor
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  defineOwnProperty(name, descriptor, throwOnError = false) {
    // Fast path: a {value}-only update on an existing writable data descriptor
    // avoids validatePropertyDescriptor, completePropertyDescriptor, and the
    // full branching logic below. This is the hottest path from `put`.
    // Guard: only enter fast-path if descriptor is a non-null object, so that
    // invalid inputs (null, numbers, etc.) still reach validatePropertyDescriptor
    // with its canonical error message.
    // The `_properties` read is deliberately direct rather than through the
    // virtual `_peekOwnDescriptor`: this branch is about to *write* the stored
    // descriptor, so it needs the real stored object, not a subclass's
    // synthesised stand-in (`ArgumentsObject` returns a fresh object for a
    // mapped parameter, and mutating that would update nothing).
    if (
      descriptor !== null &&
      typeof descriptor === 'object' &&
      isValueOnlyDescriptor(descriptor)
    ) {
      const stored = this._properties.get(name);
      if (stored !== undefined && 'value' in stored) {
        if (stored.writable === true) {
          stored.value = descriptor.value;
          return true;
        }
        if (!stored.configurable) {
          if (!Object.is(descriptor.value, stored.value)) {
            return rejectOperation(
              throwOnError,
              'Cannot change value of a non-configurable non-writable property',
            );
          }
          return true;
        }
      }
    }

    const candidate = validatePropertyDescriptor(descriptor);
    const current = this._peekOwnDescriptor(name);

    if (current === undefined) {
      if (!this._extensible) {
        return rejectOperation(
          throwOnError,
          'Cannot define property on non-extensible object',
        );
      }

      this._properties.set(name, completePropertyDescriptor(candidate));
      return true;
    }

    if (
      isEmptyDescriptor(candidate) ||
      isDescriptorSubsetEqual(current, candidate)
    ) {
      return true;
    }

    if (!current.configurable) {
      if (candidate.configurable === true) {
        return rejectOperation(
          throwOnError,
          'Cannot make a non-configurable property configurable',
        );
      }

      if (
        'enumerable' in candidate &&
        candidate.enumerable !== current.enumerable
      ) {
        return rejectOperation(
          throwOnError,
          'Cannot change enumerable on a non-configurable property',
        );
      }
    }

    const currentIsData = isDataDescriptor(current);
    const candidateIsData = isDataDescriptor(candidate);
    const candidateIsAccessor = isAccessorDescriptor(candidate);

    if (
      (candidateIsData || candidateIsAccessor) &&
      currentIsData !== candidateIsData
    ) {
      if (!current.configurable) {
        return rejectOperation(
          throwOnError,
          'Cannot change descriptor kind of a non-configurable property',
        );
      }

      const converted = candidateIsAccessor
        ? completePropertyDescriptor({
            get: undefined,
            set: undefined,
            enumerable: current.enumerable,
            configurable: current.configurable,
            ...candidate,
          })
        : completePropertyDescriptor({
            value: undefined,
            writable: false,
            enumerable: current.enumerable,
            configurable: current.configurable,
            ...candidate,
          });

      this._properties.set(name, converted);
      return true;
    }

    if (currentIsData) {
      if (!current.configurable && !current.writable) {
        if (candidate.writable === true) {
          return rejectOperation(
            throwOnError,
            'Cannot make a non-configurable non-writable property writable',
          );
        }

        if (
          'value' in candidate &&
          !Object.is(candidate.value, current.value)
        ) {
          return rejectOperation(
            throwOnError,
            'Cannot change value of a non-configurable non-writable property',
          );
        }
      }

      this._properties.set(
        name,
        completePropertyDescriptor({
          ...current,
          ...candidate,
        }),
      );
      return true;
    }

    if (!current.configurable) {
      if ('get' in candidate && candidate.get !== current.get) {
        return rejectOperation(
          throwOnError,
          'Cannot change getter of a non-configurable property',
        );
      }

      if ('set' in candidate && candidate.set !== current.set) {
        return rejectOperation(
          throwOnError,
          'Cannot change setter of a non-configurable property',
        );
      }
    }

    this._properties.set(
      name,
      completePropertyDescriptor({
        ...current,
        ...candidate,
      }),
    );
    return true;
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  delete(name, throwOnError = false) {
    const descriptor = this._peekOwnDescriptor(name);

    if (descriptor === undefined) {
      return true;
    }

    if (!descriptor.configurable) {
      return rejectOperation(
        throwOnError,
        'Cannot delete a non-configurable property',
      );
    }

    this._properties.delete(name);
    return true;
  }

  /**
   * @param {'string' | 'number' | 'default'} [hint='number']
   * @returns {string | number | boolean | symbol | null | undefined}
   */
  defaultValue(hint = 'number') {
    const methodNames =
      hint === 'string' ? ['toString', 'valueOf'] : ['valueOf', 'toString'];

    for (const name of methodNames) {
      const method = this.get(name);

      if (typeof method !== 'function' && !isCallable(method)) {
        continue;
      }

      const result = callAccessor(/** @type {any} */ (method), this, []);

      if (isPrimitive(result)) {
        return result;
      }
    }

    throw new GuestErrorSignal(
      'TypeError',
      'Cannot convert object to primitive value',
    );
  }

  /**
   * @param {PropertyKey} name
   * @returns {unknown}
   */
  getReferencedValue(name) {
    return this.get(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [strict=false]
   * @returns {void}
   */
  setReferencedValue(name, value, strict = false) {
    this.put(name, value, strict);
  }
}

/**
 * Applies the ES object integrity levels shared by Object.seal, Object.freeze,
 * and engine-created immutable objects.
 *
 * @param {EngineObject} object
 * @param {'sealed' | 'frozen'} level
 * @returns {EngineObject}
 */
export function setIntegrityLevel(object, level) {
  if (level !== 'sealed' && level !== 'frozen') {
    throw new TypeError(`Unsupported integrity level ${level}`);
  }

  for (const name of object.ownPropertyKeys()) {
    const descriptor = object.getOwnProperty(name);
    object.defineOwnProperty(
      name,
      level === 'frozen' && isDataDescriptor(descriptor)
        ? { writable: false, configurable: false }
        : { configurable: false },
      true,
    );
  }

  object.preventExtensions();
  return object;
}

/**
 * Computes the `ForInStatement` enumeration order (ECMA-262 12.6.4): every
 * enumerable string-keyed own property across `object`'s prototype chain,
 * each name visited at most once. A name already seen anywhere earlier in
 * the chain is never revisited later even when it isn't enumerable there —
 * that's exactly the spec's shadowing rule ("a property of a prototype is
 * not enumerated if it is 'shadowed' because some previous object in the
 * prototype chain has a property with the same name", regardless of that
 * earlier property's own enumerability). Symbol keys are skipped outright:
 * ES5 has no symbols, and later editions exclude them from `for-in` too.
 * Order within one object follows `ownPropertyKeys()` (insertion order),
 * matching `Object.keys`.
 *
 * @param {EngineObject} object
 * @returns {string[]}
 */
export function enumerableKeysForIn(object) {
  const seen = new Set();
  /** @type {string[]} */
  const result = [];

  for (
    let current = /** @type {EngineObject | null} */ (object);
    current !== null;
    current = current.getPrototype()
  ) {
    for (const key of current.ownPropertyKeys()) {
      if (typeof key !== 'string' || seen.has(key)) {
        continue;
      }

      seen.add(key);

      const descriptor = current._peekOwnDescriptor(key);
      if (descriptor !== undefined && descriptor.enumerable === true) {
        result.push(key);
      }
    }
  }

  return result;
}

/**
 * Re-checks one enumerated name against the live object graph, which
 * `evaluateForInStatement` does immediately before running the body for
 * that name (ECMA-262 12.6.4: "If a property that has not yet been visited
 * during enumeration is deleted, then it will not be visited").
 *
 * The check repeats exactly the lookup `enumerableKeysForIn` used to
 * decide the name in the first place — walk the prototype chain, stop at
 * the first object with an own property of that name, and answer with that
 * property's enumerability — so the shadowing rule stays consistent
 * between the snapshot and the re-check. Deleting an own property that
 * shadowed an enumerable inherited one therefore leaves the name live (the
 * inherited property is what the body now sees), while deleting one that
 * shadowed a *non-enumerable* inherited property drops the name, and so
 * does making the property non-enumerable mid-loop: 12.6.4 step 6 asks for
 * the next property "whose [[Enumerable]] attribute is true" each time
 * round, not for the attribute it had at loop entry.
 *
 * Those last two cases are where real engines disagree — JavaScriptCore
 * answers as this does, V8 keeps such a name because its re-check is a
 * bare `HasProperty` — which is the spec telling us it left the choice
 * open: 12.6.4 fixes only the deletion rule and leaves "the mechanics and
 * order of enumerating the properties" implementation-defined. Answering
 * with the same walk the snapshot used is the self-consistent choice: a
 * name whose first own occurrence is non-enumerable never enters the
 * snapshot, so it should not survive in it either.
 *
 * @param {EngineObject} object
 * @param {string} key
 * @returns {boolean}
 */
export function isEnumerableForIn(object, key) {
  for (
    let current = /** @type {EngineObject | null} */ (object);
    current !== null;
    current = current.getPrototype()
  ) {
    const descriptor = current._peekOwnDescriptor(key);

    if (descriptor !== undefined) {
      return descriptor.enumerable === true;
    }
  }

  return false;
}

/**
 * Invokes a function value that the object model holds internally — an
 * accessor's getter/setter, a `toString`/`valueOf` method found during
 * `[[DefaultValue]]`, or an accessor reached through the special
 * `[[Get]]`/`[[Put]]` that a Reference with a primitive base uses
 * (ECMA-262 8.7.1/8.7.2), which supplies the primitive itself as
 * `thisValue`.
 *
 * Two callable shapes reach this point: engine functions created by guest
 * code, which use the engine call protocol, and plain host callbacks,
 * which engine-internal code (realm bootstrapping, tests) may install
 * directly. Guest values are never host functions, so the host branch can
 * never be reached from guest code.
 *
 * @param {((...args: any[]) => unknown) | import('./descriptors.js').CallableLike} accessor
 * @param {unknown} thisValue
 * @param {unknown[]} args
 * @returns {unknown}
 */
export function callAccessor(accessor, thisValue, args) {
  if (typeof accessor === 'function') {
    return accessor.call(thisValue, ...args);
  }

  if (isCallable(accessor)) {
    return accessor.callFunction(thisValue, args);
  }

  throw new TypeError('Accessor is not callable');
}

/**
 * Signals a guest-visible property-operation rejection. When `throwOnError`
 * is true, throws a `GuestErrorSignal` so the nearest realm-aware boundary
 * (`EngineFunction#callFunction`, `evaluateScript`, or the `runToCompletion`
 * helper in `evaluateTryStatement`) can convert it into a proper guest
 * `TypeError` throw completion. When false, returns `false` so
 * callers that propagate boolean success flags (e.g. non-strict `[[Put]]`)
 * can continue without an exception.
 *
 * @param {boolean} throwOnError
 * @param {string} message
 * @returns {false}
 */
function rejectOperation(throwOnError, message) {
  if (throwOnError) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return false;
}

/**
 * The descriptor `OrdinarySetWithOwnDescriptor` (ECMA-262 10.1.9.2) invents
 * when a `set` walk reaches the end of the prototype chain (`ownDesc` is
 * undefined and the final prototype is `null`): an implicit, writable,
 * enumerable, configurable data property whose value is `undefined`. Passing
 * it through the same data-descriptor branch as a real found descriptor is
 * what makes an ordinary assignment to a wholly new property name behave
 * like `CreateDataProperty` on the receiver.
 *
 * @type {CompletePropertyDescriptor}
 */
const IMPLICIT_DATA_DESCRIPTOR = {
  value: undefined,
  writable: true,
  enumerable: true,
  configurable: true,
};

/**
 * Applies `OrdinarySetWithOwnDescriptor` (ECMA-262 10.1.9.2) once the
 * governing descriptor `ownDesc` — found on `this` or one of its ordinary
 * prototypes — is known. `receiver` is the object the assignment is
 * ultimately observed on: a data descriptor is realized as an own property
 * of `receiver` (never of the object that owned `ownDesc`, unless they are
 * the same object), while an accessor's setter is invoked with `receiver` as
 * `this`, exactly like an inherited ES setter runs against the original
 * assignment target rather than the object it is defined on.
 *
 * @param {PropertyKey} name
 * @param {CompletePropertyDescriptor} ownDesc
 * @param {boolean} ownerIsReceiver Whether `ownDesc` was read directly off
 *   `receiver` itself (i.e. the `set` walk's `current === receiver` on the
 *   step that found it), as opposed to off some other object in the
 *   prototype chain or the implicit end-of-chain descriptor. When true, a
 *   fresh `receiver.getOwnProperty(name)` lookup would only reconfirm facts
 *   already known from `ownDesc` (present, data, writable) at the cost of an
 *   extra virtual dispatch and descriptor copy — this is the hot path for a
 *   plain `obj.prop = value` assignment to an existing writable own data
 *   property, so it is worth skipping.
 * @param {unknown} value
 * @param {unknown} receiver
 * @param {boolean} throwOnError
 * @returns {boolean}
 */
function setWithOwnDescriptor(
  name,
  ownDesc,
  ownerIsReceiver,
  value,
  receiver,
  throwOnError,
) {
  if (isDataDescriptor(ownDesc)) {
    if (!ownDesc.writable) {
      return rejectOperation(
        throwOnError,
        'Cannot assign to read only property',
      );
    }

    if (!(receiver instanceof EngineObject)) {
      return rejectOperation(
        throwOnError,
        'Cannot create property on non-object receiver',
      );
    }

    if (ownerIsReceiver) {
      return receiver.defineOwnProperty(name, { value }, throwOnError);
    }

    const existing = receiver.getOwnProperty(name);

    if (existing !== undefined) {
      if (isAccessorDescriptor(existing) || !existing.writable) {
        return rejectOperation(
          throwOnError,
          'Cannot assign to read only property',
        );
      }

      return receiver.defineOwnProperty(name, { value }, throwOnError);
    }

    return receiver.defineOwnProperty(
      name,
      { value, writable: true, enumerable: true, configurable: true },
      throwOnError,
    );
  }

  // ownDesc is an accessor descriptor (OrdinarySetWithOwnDescriptor asserts
  // IsAccessorDescriptor here, since ownDesc is always either a data or an
  // accessor descriptor by construction).
  if (ownDesc.set === undefined) {
    return rejectOperation(throwOnError, 'Cannot assign to accessor property');
  }

  callAccessor(ownDesc.set, receiver, [value]);
  return true;
}

/**
 * @param {CompletePropertyDescriptor} current
 * @param {PropertyDescriptorRecord} candidate
 * @returns {boolean}
 */
function isDescriptorSubsetEqual(current, candidate) {
  if ('value' in candidate && !Object.is(candidate.value, current.value)) {
    return false;
  }

  if ('writable' in candidate && candidate.writable !== current.writable) {
    return false;
  }

  if ('get' in candidate && candidate.get !== current.get) {
    return false;
  }

  if ('set' in candidate && candidate.set !== current.set) {
    return false;
  }

  if (
    'enumerable' in candidate &&
    candidate.enumerable !== current.enumerable
  ) {
    return false;
  }

  if (
    'configurable' in candidate &&
    candidate.configurable !== current.configurable
  ) {
    return false;
  }

  return true;
}

/**
 * @param {PropertyDescriptorRecord} descriptor
 * @returns {boolean}
 */
function isEmptyDescriptor(descriptor) {
  return Object.keys(descriptor).length === 0;
}

/**
 * True when `descriptor` carries exactly a `value` field and nothing else.
 * This identifies the fast path from `put` that only needs to update the
 * stored value without touching writable/enumerable/configurable.
 *
 * @param {PropertyDescriptorRecord} descriptor
 * @returns {boolean}
 */
function isValueOnlyDescriptor(descriptor) {
  return (
    'value' in descriptor &&
    !('writable' in descriptor) &&
    !('enumerable' in descriptor) &&
    !('configurable' in descriptor) &&
    !('get' in descriptor) &&
    !('set' in descriptor)
  );
}

/**
 * @param {unknown} value
 * @returns {value is string | number | boolean | symbol | null | undefined}
 */
function isPrimitive(value) {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}

/**
 * Whether `key` is an ES2015 6.1.7 "array index": a String that is the
 * canonical decimal representation of an integer in `[0, 2^32 - 2]` (the
 * upper bound is exclusive of `4294967295`, which is a valid `length` value
 * but not a valid index). `String(index) === key` rejects non-canonical
 * forms — leading zeros other than `"0"` itself, `"1.0"`, `"-1"` — the same
 * way `toArrayIndex` in `array-object.js` does; this engine has no symbols
 * yet, so a non-string key is never an array index.
 *
 * @param {PropertyKey} key
 * @returns {boolean}
 */
function isArrayIndexKey(key) {
  if (typeof key !== 'string') {
    return false;
  }

  const index = Number(key);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 4294967295 &&
    String(index) === key
  );
}
