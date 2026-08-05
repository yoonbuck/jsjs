import { EngineObject } from './object.js';
import { Reference } from './reference.js';
import {
  createUninitializedBindingError,
  createUnresolvableReferenceError,
} from './errors.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 *
 * @typedef {{
 *   value: unknown,
 *   mutable: boolean,
 *   initialized: boolean,
 *   deletable: boolean,
 * }} Binding
 */

/**
 * A declarative environment record holds bindings created directly by
 * declarations (`var`, function parameters, catch clauses, and future
 * `let`/`const` bindings) rather than as properties of an object.
 */
export class DeclarativeEnvironmentRecord {
  /**
   * @param {EnvironmentRecordLike | null} [outer=null]
   */
  constructor(outer = null) {
    this.outer = outer;
    /** @type {Map<PropertyKey, Binding>} */
    this._bindings = new Map();
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasBinding(name) {
    return this._bindings.has(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} [deletable=false]
   * @returns {void}
   */
  createMutableBinding(name, deletable = false) {
    this._rejectExisting(name);
    this._bindings.set(name, {
      value: undefined,
      mutable: true,
      initialized: false,
      deletable,
    });
  }

  /**
   * @param {PropertyKey} name
   * @returns {void}
   */
  createImmutableBinding(name) {
    this._rejectExisting(name);
    this._bindings.set(name, {
      value: undefined,
      mutable: false,
      initialized: false,
      deletable: false,
    });
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @returns {void}
   */
  initializeBinding(name, value) {
    const binding = this._requireBinding(name);
    binding.value = value;
    binding.initialized = true;
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} strict
   * @returns {void}
   */
  setMutableBinding(name, value, strict) {
    const binding = this._bindings.get(name);

    if (binding === undefined) {
      throw createUnresolvableReferenceError(String(name));
    }

    if (!binding.initialized) {
      throw createUninitializedBindingError(String(name));
    }

    if (!binding.mutable) {
      if (strict) {
        throw new TypeError(`Assignment to constant binding ${String(name)}`);
      }

      return;
    }

    binding.value = value;
  }

  /**
   * The strict flag is accepted for interface parity with other environment
   * records but is not consulted: uninitialized declarative bindings always
   * throw regardless of strictness, matching spec behavior.
   *
   * @param {PropertyKey} name
   * @param {boolean} _strict
   * @returns {unknown}
   */
  getBindingValue(name, _strict) {
    const binding = this._bindings.get(name);

    if (binding === undefined) {
      throw createUnresolvableReferenceError(String(name));
    }

    if (!binding.initialized) {
      throw createUninitializedBindingError(String(name));
    }

    return binding.value;
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  deleteBinding(name) {
    const binding = this._bindings.get(name);

    if (binding === undefined) {
      return true;
    }

    if (!binding.deletable) {
      return false;
    }

    this._bindings.delete(name);
    return true;
  }

  /**
   * @param {PropertyKey} name
   * @returns {void}
   */
  _rejectExisting(name) {
    if (this._bindings.has(name)) {
      throw new TypeError(`Binding ${String(name)} already exists`);
    }
  }

  /**
   * @param {PropertyKey} name
   * @returns {Binding}
   */
  _requireBinding(name) {
    const binding = this._bindings.get(name);

    if (binding === undefined) {
      throw createUnresolvableReferenceError(String(name));
    }

    return binding;
  }
}

/**
 * An object environment record binds each own/inherited property of a guest
 * `EngineObject` as a binding name. It backs `with` statement scoping and the
 * global object's var/function bindings.
 */
export class ObjectEnvironmentRecord {
  /**
   * @param {EngineObject} bindingObject
   * @param {EnvironmentRecordLike | null} [outer=null]
   */
  constructor(bindingObject, outer = null) {
    if (!(bindingObject instanceof EngineObject)) {
      throw new TypeError(
        'ObjectEnvironmentRecord requires an EngineObject binding object',
      );
    }

    this.outer = outer;
    this.bindingObject = bindingObject;
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasBinding(name) {
    return this.bindingObject.hasProperty(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} [deletable=true]
   * @returns {void}
   */
  createMutableBinding(name, deletable = true) {
    this.bindingObject.defineOwnProperty(
      name,
      {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: deletable,
      },
      true,
    );
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} strict
   * @returns {void}
   */
  setMutableBinding(name, value, strict) {
    this.bindingObject.put(name, value, strict);
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} strict
   * @returns {unknown}
   */
  getBindingValue(name, strict) {
    if (!this.bindingObject.hasProperty(name)) {
      if (strict) {
        throw createUnresolvableReferenceError(String(name));
      }

      return undefined;
    }

    return this.bindingObject.get(name);
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  deleteBinding(name) {
    return this.bindingObject.delete(name);
  }
}

/**
 * The global environment record combines a declarative record (reserved for
 * lexical global bindings) with an object environment record bound to the
 * realm's global object (`var`/function declarations). This mirrors the
 * dual-record global environment structure so future lexical global bindings
 * have a home without disturbing the object-backed var bindings ES5 relies
 * on.
 */
export class GlobalEnvironmentRecord {
  /**
   * @param {EngineObject} globalObject
   */
  constructor(globalObject) {
    /** @type {EnvironmentRecordLike | null} */
    this.outer = null;
    this.globalObject = globalObject;
    this.objectRecord = new ObjectEnvironmentRecord(globalObject);
    this.declarativeRecord = new DeclarativeEnvironmentRecord();
    /** @type {Set<PropertyKey>} */
    this.varNames = new Set();
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasBinding(name) {
    return (
      this.declarativeRecord.hasBinding(name) ||
      this.objectRecord.hasBinding(name)
    );
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} [deletable=false]
   * @returns {void}
   */
  createMutableBinding(name, deletable = false) {
    this.declarativeRecord.createMutableBinding(name, deletable);
  }

  /**
   * @param {PropertyKey} name
   * @returns {void}
   */
  createImmutableBinding(name) {
    this.declarativeRecord.createImmutableBinding(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @returns {void}
   */
  initializeBinding(name, value) {
    this.declarativeRecord.initializeBinding(name, value);
  }

  /**
   * Ensures the global object carries a mutable, `var`-style binding for
   * `name`, initialized to `undefined` if it did not already exist.
   *
   * @param {PropertyKey} name
   * @param {boolean} deletable
   * @returns {void}
   */
  createGlobalVarBinding(name, deletable) {
    if (!this.objectRecord.hasBinding(name)) {
      this.objectRecord.createMutableBinding(name, deletable);
      this.objectRecord.setMutableBinding(name, undefined, false);
    }

    this.varNames.add(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} strict
   * @returns {void}
   */
  setMutableBinding(name, value, strict) {
    if (this.declarativeRecord.hasBinding(name)) {
      this.declarativeRecord.setMutableBinding(name, value, strict);
      return;
    }

    this.objectRecord.setMutableBinding(name, value, strict);
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} strict
   * @returns {unknown}
   */
  getBindingValue(name, strict) {
    if (this.declarativeRecord.hasBinding(name)) {
      return this.declarativeRecord.getBindingValue(name, strict);
    }

    return this.objectRecord.getBindingValue(name, strict);
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  deleteBinding(name) {
    if (this.declarativeRecord.hasBinding(name)) {
      return false;
    }

    if (!this.varNames.has(name)) {
      return this.objectRecord.deleteBinding(name);
    }

    const deleted = this.objectRecord.deleteBinding(name);

    if (deleted) {
      this.varNames.delete(name);
    }

    return deleted;
  }

  /**
   * @returns {EngineObject}
   */
  getThisBinding() {
    return this.globalObject;
  }
}

/**
 * @typedef {DeclarativeEnvironmentRecord | ObjectEnvironmentRecord | GlobalEnvironmentRecord} EnvironmentRecordLike
 */

/**
 * @param {EnvironmentRecordLike | null} outer
 * @returns {DeclarativeEnvironmentRecord}
 */
export function newDeclarativeEnvironment(outer) {
  return new DeclarativeEnvironmentRecord(outer);
}

/**
 * @param {EngineObject} bindingObject
 * @param {EnvironmentRecordLike | null} outer
 * @returns {ObjectEnvironmentRecord}
 */
export function newObjectEnvironment(bindingObject, outer) {
  return new ObjectEnvironmentRecord(bindingObject, outer);
}

/**
 * Walks an environment chain looking for the innermost record that already
 * has a binding for `name`, and returns a `Reference` rooted at that record.
 * When no environment in the chain has the binding, the returned reference
 * has an `undefined` base and is unresolvable, matching identifier lookup
 * failure semantics.
 *
 * @param {EnvironmentRecordLike | null} env
 * @param {string | symbol} name
 * @param {boolean} strict
 * @returns {Reference}
 */
export function getIdentifierReference(env, name, strict) {
  if (env === null) {
    return new Reference(undefined, name, strict);
  }

  if (env.hasBinding(name)) {
    return new Reference(env, name, strict);
  }

  return getIdentifierReference(env.outer, name, strict);
}
