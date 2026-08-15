import { EngineObject } from './object.js';
import { Reference, UnresolvableReference } from './reference.js';
import { GuestErrorSignal } from './completion.js';
import { isDataDescriptor } from './descriptors.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 *
 * @typedef {{
 *   value: unknown,
 *   mutable: boolean,
 *   initialized: boolean,
 *   deletable: boolean,
 *   strict: boolean,
 * }} Binding
 */

/**
 * A declarative environment record holds bindings created directly by
 * declarations (`var`, function parameters, catch clauses, and `let`/`const`
 * lexical declarations) rather than as properties of an object.
 */
export class DeclarativeEnvironmentRecord {
  /**
   * @param {EnvironmentRecordLike | null} [outer=null]
   */
  constructor(outer = null) {
    this.outer = outer;
    /** @type {Map<PropertyKey, Binding>} */
    this._bindings = new Map();
    // ES2015 Annex B.3.5: a non-strict direct `eval` may hoist a `var` over a
    // `Catch` clause parameter of the same name (the `var` then binds the catch
    // parameter). `EvalDeclarationInstantiation`'s var/lexical conflict walk
    // (§18.2.1.2 step 5, as amended by Annex B.3.5) therefore exempts the
    // record that holds a catch parameter from the "already declared"
    // SyntaxError. Set by the `try`/`catch` evaluator on that one record only;
    // an ordinary block/function/loop environment leaves it false.
    this.isCatchClauseEnvironment = false;
  }

  /**
   * ECMA-262 5.1 §10.2.1.1.6: a declarative environment never provides a
   * `this` value to a call whose callee it resolves.
   *
   * @returns {undefined}
   */
  implicitThisValue() {
    return undefined;
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
      strict: false,
    });
  }

  /**
   * ECMA-262 6th edition §8.1.1.1.3 `CreateImmutableBinding`. `strict`
   * records whether a later `SetMutableBinding` on this name must throw
   * even for a non-strict reference — the distinction between `const`
   * (`S = true`) and the ES5.1 named-function-expression binding created at
   * `evaluateFunctionExpression` (`S = false`, so a sloppy reassignment of
   * the function's own name stays a silent no-op while a strict one still
   * throws).
   *
   * @param {PropertyKey} name
   * @param {boolean} [strict=false]
   * @returns {void}
   */
  createImmutableBinding(name, strict = false) {
    this._rejectExisting(name);
    this._bindings.set(name, {
      value: undefined,
      mutable: false,
      initialized: false,
      deletable: false,
      strict,
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
   * ECMA-262 6th edition §8.1.1.1.5 `SetMutableBinding`. An immutable
   * binding throws when *either* the binding itself was created strict
   * (`const`, §13.3.1) or the reference performing the assignment is
   * strict (`S` in the abstract operation's step 5) — only a non-strict
   * reference to a non-strict immutable binding (the ES5.1 named-function-
   * expression binding) stays a silent no-op.
   *
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} strict
   * @returns {void}
   */
  setMutableBinding(name, value, strict) {
    const binding = this._bindings.get(name);

    if (binding === undefined) {
      throw new GuestErrorSignal(
        'ReferenceError',
        `${String(name)} is not defined`,
      );
    }

    if (!binding.initialized) {
      throw new GuestErrorSignal(
        'ReferenceError',
        `Cannot access '${String(name)}' before initialization`,
      );
    }

    if (!binding.mutable) {
      if (strict || binding.strict) {
        throw new GuestErrorSignal(
          'TypeError',
          `Assignment to constant variable.`,
        );
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
      throw new GuestErrorSignal(
        'ReferenceError',
        `${String(name)} is not defined`,
      );
    }

    if (!binding.initialized) {
      throw new GuestErrorSignal(
        'ReferenceError',
        `Cannot access '${String(name)}' before initialization`,
      );
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
      throw new ReferenceError(`No binding for ${String(name)}`);
    }

    return binding;
  }
}

/**
 * @typedef {{
 *   kind: 'named',
 *   targetModule: import('./module-record.js').SourceTextModuleRecord,
 *   targetName: string,
 * } | {
 *   kind: 'namespace',
 *   targetModule: import('./module-record.js').SourceTextModuleRecord,
 * }} ModuleImportBinding
 */

/**
 * A module environment holds ordinary module-local bindings plus indirect import
 * bindings. Imports are intentionally kept outside `_bindings`: an import reads
 * its target environment every time rather than copying a value at link time.
 */
export class ModuleEnvironmentRecord extends DeclarativeEnvironmentRecord {
  /**
   * @param {EnvironmentRecordLike | null} outer
   */
  constructor(outer) {
    super(outer);
    /** @type {Map<PropertyKey, ModuleImportBinding>} */
    this._importBindings = new Map();
  }

  /**
   * @param {PropertyKey} localName
   * @param {import('./module-record.js').SourceTextModuleRecord} targetModule
   * @param {string} targetName
   * @returns {void}
   */
  createImportBinding(localName, targetModule, targetName) {
    this._rejectExisting(localName);
    this._importBindings.set(localName, {
      kind: 'named',
      targetModule,
      targetName,
    });
  }

  /**
   * @param {PropertyKey} localName
   * @param {import('./module-record.js').SourceTextModuleRecord} targetModule
   * @returns {void}
   */
  createNamespaceImportBinding(localName, targetModule) {
    this._rejectExisting(localName);
    this._importBindings.set(localName, {
      kind: 'namespace',
      targetModule,
    });
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasBinding(name) {
    return this._importBindings.has(name) || super.hasBinding(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} strict
   * @returns {unknown}
   */
  getBindingValue(name, strict) {
    const importBinding = this._importBindings.get(name);

    if (importBinding === undefined) {
      return super.getBindingValue(name, strict);
    }

    if (importBinding.kind === 'namespace') {
      return importBinding.targetModule.getNamespace();
    }

    const targetEnvironment = importBinding.targetModule.environment;

    if (targetEnvironment === null) {
      throw new TypeError('Imported module environment is not initialized');
    }

    return targetEnvironment.getBindingValue(importBinding.targetName, true);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} strict
   * @returns {void}
   */
  setMutableBinding(name, value, strict) {
    if (this._importBindings.has(name)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Assignment to constant variable.',
      );
    }

    super.setMutableBinding(name, value, strict);
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  deleteBinding(name) {
    if (this._importBindings.has(name)) {
      return false;
    }

    return super.deleteBinding(name);
  }

  /**
   * @param {PropertyKey} name
   * @returns {void}
   */
  _rejectExisting(name) {
    if (this._importBindings.has(name) || this._bindings.has(name)) {
      throw new TypeError(`Binding ${String(name)} already exists`);
    }
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
   * @param {boolean} [provideThis=false]
   */
  constructor(bindingObject, outer = null, provideThis = false) {
    if (!(bindingObject instanceof EngineObject)) {
      throw new TypeError(
        'ObjectEnvironmentRecord requires an EngineObject binding object',
      );
    }

    this.outer = outer;
    this.bindingObject = bindingObject;
    // ECMA-262 5.1 §10.2.1.2: the `with` statement sets this flag so the
    // binding object becomes the `this` value of calls resolved through it
    // (§10.2.1.2.6). The global object's object record leaves it false.
    this.provideThis = provideThis;
  }

  /**
   * ECMA-262 5.1 §10.2.1.2.6: return the binding object when `provideThis`
   * is set (inside a `with`), otherwise `undefined`.
   *
   * @returns {EngineObject | undefined}
   */
  implicitThisValue() {
    return this.provideThis ? this.bindingObject : undefined;
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasBinding(name) {
    return this.bindingObject.hasProperty(name);
  }

  /**
   * Reports whether the binding object carries `name` as an *own* property,
   * ignoring anything only visible through the prototype chain. Used by
   * `GlobalEnvironmentRecord#createGlobalVarBinding`, which must not treat
   * an inherited intrinsic (e.g. `toString`) as already declared.
   *
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasOwnBinding(name) {
    return this.bindingObject.getOwnProperty(name) !== undefined;
  }

  /**
   * @returns {boolean}
   */
  isExtensible() {
    return this.bindingObject.isExtensible();
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
        throw new GuestErrorSignal(
          'ReferenceError',
          `${String(name)} is not defined`,
        );
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
 * The global environment record combines a declarative record (holding
 * lexical global bindings — `let`/`const` and lexical function declarations at
 * global scope) with an object environment record bound to the realm's global
 * object (`var`/function declarations). This mirrors the dual-record global
 * environment structure so lexical global bindings have a home without
 * disturbing the object-backed var bindings ES5 relies on.
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
   * ECMA-262 6th edition §8.1.1.4.3 `CreateImmutableBinding`: forwards to
   * the global environment's declarative record, carrying the `strict`
   * flag through (see `DeclarativeEnvironmentRecord#createImmutableBinding`).
   *
   * @param {PropertyKey} name
   * @param {boolean} [strict=false]
   * @returns {void}
   */
  createImmutableBinding(name, strict = false) {
    this.declarativeRecord.createImmutableBinding(name, strict);
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
   * Existence is checked via the binding object's *own*-property presence
   * (not `HasBinding`/`[[HasProperty]]`, which also sees inherited
   * properties): a `var` declaration whose name collides with an inherited
   * intrinsic (e.g. `toString`) must still create an own property on the
   * global object with the caller-supplied `deletable`/configurable
   * semantics. Skipping creation here would leave the first assignment to
   * fall through to `[[Put]]`, which always creates new own properties as
   * configurable, silently losing the intended non-configurable var
   * semantics.
   *
   * When the name is not already an own property, creation goes through
   * `CreateMutableBinding`, whose `[[DefineOwnProperty]]` runs with the Throw
   * flag set (ECMA-262 10.2.1.2.2). On a non-extensible global object that
   * raises a guest `TypeError`, which is the ES5.1 10.5 behavior for declaring
   * a new global `var` (or function) when the global can no longer grow —
   * this method no longer silently no-ops in that case.
   *
   * @param {PropertyKey} name
   * @param {boolean} deletable
   * @returns {void}
   */
  createGlobalVarBinding(name, deletable) {
    if (!this.objectRecord.hasOwnBinding(name)) {
      this.objectRecord.createMutableBinding(name, deletable);
      this.objectRecord.setMutableBinding(name, undefined, false);
    }

    this.varNames.add(name);
  }

  /**
   * Binds a hoisted global function declaration `name` to `value`, applying
   * ECMA-262 (ES5.1) 10.5 steps 5.c–5.f for the global environment record.
   *
   * As with `createGlobalVarBinding`, existence and the redefinition decision
   * are made against the global object's *own* property (the engine's
   * deliberate own-property model, avoiding ES5.1's inherited-property quirk):
   *
   * - no own property: created like a global `var` (so a non-extensible
   *   global raises a guest `TypeError`);
   * - configurable own property: redefined to a writable, enumerable data
   *   property (discarding any accessor), with `configurable` set from
   *   `deletable`;
   * - non-configurable own property that is a writable *and* enumerable data
   *   property: only its value is updated;
   * - any other non-configurable own property (an accessor, or a data
   *   property that is not both writable and enumerable): a guest `TypeError`,
   *   raised by `[[DefineOwnProperty]]` running with the Throw flag.
   *
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} deletable
   * @returns {void}
   */
  createGlobalFunctionBinding(name, value, deletable) {
    // A lexical global binding (let/const) takes precedence; ES5 never creates
    // one, but the delegation stays correct now that ES2015 can.
    if (this.declarativeRecord.hasBinding(name)) {
      this.declarativeRecord.setMutableBinding(name, value, false);
      return;
    }

    const existing = this.globalObject.getOwnProperty(name);
    const keepAttributesUpdateValue =
      existing !== undefined &&
      !existing.configurable &&
      isDataDescriptor(existing) &&
      existing.writable === true &&
      existing.enumerable === true;

    if (keepAttributesUpdateValue) {
      // Non-configurable but writable+enumerable: leave the attributes, update
      // the value only (10.5 step 5.e falls through to SetMutableBinding).
      this.globalObject.defineOwnProperty(name, { value }, true);
    } else {
      // Fresh name, a configurable property (redefined), or an illegal target.
      // `[[DefineOwnProperty]]` with the Throw flag turns an illegal target
      // (a non-configurable accessor / non-writable / non-enumerable property,
      // or a new property on a non-extensible global) into a guest TypeError,
      // matching 10.5 step 5.e.iv and the CreateMutableBinding extensibility
      // check.
      this.globalObject.defineOwnProperty(
        name,
        {
          value,
          writable: true,
          enumerable: true,
          configurable: deletable,
        },
        true,
      );
    }

    this.varNames.add(name);
  }

  /**
   * ECMA-262 6th edition §8.1.1.4.12 `HasVarDeclaration`.
   *
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasVarDeclaration(name) {
    return this.varNames.has(name);
  }

  /**
   * ECMA-262 6th edition §8.1.1.4.13 `HasLexicalDeclaration`.
   *
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasLexicalDeclaration(name) {
    return this.declarativeRecord.hasBinding(name);
  }

  /**
   * ECMA-262 6th edition §8.1.1.4.14 `HasRestrictedGlobalProperty`. Looks
   * only at the global object's *own* property (matching the deliberate
   * own-property model documented on `createGlobalVarBinding` above): a
   * name with no own property is never restricted, even if one is
   * inherited. `undefined`, `NaN`, and `Infinity` are non-configurable own
   * properties of the realm's global object, so this is what makes
   * `let undefined;` a `SyntaxError`-worthy redeclaration while
   * `let toString;` (only inherited) stays allowed.
   *
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasRestrictedGlobalProperty(name) {
    const existing = this.globalObject.getOwnProperty(name);

    if (existing === undefined) {
      return false;
    }

    return existing.configurable === false;
  }

  /**
   * ECMA-262 6th edition §8.1.1.4.15 `CanDeclareGlobalVar`.
   *
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  canDeclareGlobalVar(name) {
    if (this.objectRecord.hasOwnBinding(name)) {
      return true;
    }

    return this.objectRecord.isExtensible();
  }

  /**
   * ECMA-262 6th edition §8.1.1.4.16 `CanDeclareGlobalFunction`.
   *
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  canDeclareGlobalFunction(name) {
    const existing = this.globalObject.getOwnProperty(name);

    if (existing === undefined) {
      return this.objectRecord.isExtensible();
    }

    if (existing.configurable === true) {
      return true;
    }

    return (
      isDataDescriptor(existing) &&
      existing.writable === true &&
      existing.enumerable === true
    );
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

  /**
   * ECMA-262 5.1 §10.2.3: the global environment never supplies an implicit
   * `this` to calls it resolves; the caller falls back to `undefined`.
   *
   * @returns {undefined}
   */
  implicitThisValue() {
    return undefined;
  }
}

/**
 * @typedef {DeclarativeEnvironmentRecord | ModuleEnvironmentRecord | ObjectEnvironmentRecord | GlobalEnvironmentRecord} EnvironmentRecordLike
 */

/**
 * The function-specific portion of an execution context. Ordinary calls create
 * a fresh record; arrows retain the record from their enclosing execution.
 *
 * @typedef {{
 *   outer: FunctionExecutionEnvironment | undefined,
 *   thisStatus: 'lexical' | 'uninitialized' | 'initialized',
 *   thisValue: unknown,
 *   homeObject?: EngineObject,
 *   newTarget?: unknown,
 *   activeConstructor?: import('./function-object.js').EngineFunction,
 * }} FunctionExecutionEnvironment
 */

/**
 * @param {{
 *   outer?: FunctionExecutionEnvironment,
 *   thisStatus: 'lexical' | 'uninitialized' | 'initialized',
 *   thisValue?: unknown,
 *   homeObject?: EngineObject,
 *   newTarget?: unknown,
 *   activeConstructor?: import('./function-object.js').EngineFunction,
 * }} options
 * @returns {FunctionExecutionEnvironment}
 */
export function createFunctionExecutionEnvironment({
  outer = undefined,
  thisStatus,
  thisValue = undefined,
  homeObject = undefined,
  newTarget = undefined,
  activeConstructor = undefined,
}) {
  /** @type {FunctionExecutionEnvironment} */
  const environment = {
    outer,
    thisStatus,
    thisValue,
    newTarget,
  };

  if (homeObject !== undefined) {
    environment.homeObject = homeObject;
  }

  if (activeConstructor !== undefined) {
    environment.activeConstructor = activeConstructor;
  }

  return environment;
}

/**
 * @param {FunctionExecutionEnvironment | undefined} functionEnvironment
 * @returns {unknown}
 */
export function getThisBinding(functionEnvironment) {
  let current = functionEnvironment;

  while (current !== undefined) {
    if (current.thisStatus === 'initialized') {
      return current.thisValue;
    }

    if (current.thisStatus === 'uninitialized') {
      throw new GuestErrorSignal(
        'ReferenceError',
        "Must call super constructor in derived class before accessing 'this'",
      );
    }

    current = current.outer;
  }

  throw new GuestErrorSignal('ReferenceError', 'This binding is not available');
}

/**
 * @param {FunctionExecutionEnvironment} functionEnvironment
 * @param {unknown} value
 * @returns {unknown}
 */
export function bindThisValue(functionEnvironment, value) {
  if (functionEnvironment.thisStatus !== 'uninitialized') {
    throw new GuestErrorSignal(
      'ReferenceError',
      'This binding has already been initialized',
    );
  }

  functionEnvironment.thisValue = value;
  functionEnvironment.thisStatus = 'initialized';
  return value;
}

/**
 * Arrows reuse their enclosing function execution record, so a method
 * HomeObject must be present on the supplied record itself. An ordinary
 * function creates its own record and therefore stops lexical `super` lookup.
 *
 * @param {FunctionExecutionEnvironment | undefined} functionEnvironment
 * @returns {EngineObject}
 */
export function getSuperHomeObject(functionEnvironment) {
  if (functionEnvironment?.homeObject instanceof EngineObject) {
    return functionEnvironment.homeObject;
  }

  throw new GuestErrorSignal(
    'ReferenceError',
    "'super' keyword is only valid inside a method",
  );
}

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
 * @param {boolean} [provideThis=false]
 * @returns {ObjectEnvironmentRecord}
 */
export function newObjectEnvironment(
  bindingObject,
  outer,
  provideThis = false,
) {
  return new ObjectEnvironmentRecord(bindingObject, outer, provideThis);
}

/**
 * Walks an environment chain looking for the innermost record that already
 * has a binding for `name`, and returns a `Reference` rooted at that record.
 * When no environment in the chain has the binding, the returned reference
 * is an `UnresolvableReference` carrying the global object of the
 * `GlobalEnvironmentRecord` the chain is rooted in — the object a non-strict
 * assignment must create the property on (ECMA-262 8.7.2 step 3.b). A chain
 * that is not rooted in a global environment carries `null` instead, so a
 * reference resolved outside a realm has nothing to fall back to.
 *
 * @param {EnvironmentRecordLike | null} env
 * @param {string | symbol} name
 * @param {boolean} strict
 * @returns {Reference}
 */
export function getIdentifierReference(env, name, strict) {
  if (env === null) {
    return new UnresolvableReference(name, strict, null);
  }

  if (env.hasBinding(name)) {
    return new Reference(env, name, strict);
  }

  if (env.outer === null) {
    return new UnresolvableReference(name, strict, globalObjectOf(env));
  }

  return getIdentifierReference(env.outer, name, strict);
}

/**
 * @param {EnvironmentRecordLike} env
 * @returns {EngineObject | null}
 */
function globalObjectOf(env) {
  return env instanceof GlobalEnvironmentRecord ? env.globalObject : null;
}

/**
 * Resolves an identifier directly to its bound value — the fused equivalent of
 * `getValue(getIdentifierReference(env, name, strict))` for the read path,
 * without allocating the intermediate `Reference`.
 *
 * The walk is deliberately identical to `getIdentifierReference`'s: it finds
 * the innermost record whose `hasBinding(name)` is true and returns that
 * record's `getBindingValue(name, strict)`, and when no record in the chain
 * binds the name it throws the same guest `ReferenceError` `GetValue` throws
 * for an unresolvable reference (ECMA-262 8.7.1 via 8.7 `IsUnresolvableReference`
 * / 8.7.2 step 3). Every observable of the reference path is preserved — the
 * *same* record's `getBindingValue` (so declarative uninitialized-binding
 * throws, object-record strict/non-strict handling, and the global record's
 * declarative-over-object precedence all still apply) and the exact
 * `"<name> is not defined"` message — so this is a pure allocation-elimination
 * over the read path the profiling evidence ranks #1 (`reference.js#getValue`).
 *
 * Only reads may use this: `PutValue`, `delete`, and `typeof`'s
 * unresolvable-to-`'undefined'` rule still need the `Reference` itself, so
 * those callers keep using `getIdentifierReference`.
 *
 * @param {EnvironmentRecordLike | null} env
 * @param {string | symbol} name
 * @param {boolean} strict
 * @returns {unknown}
 */
export function getIdentifierBindingValue(env, name, strict) {
  /** @type {EnvironmentRecordLike | null} */
  let record = env;

  while (record !== null) {
    if (record.hasBinding(name)) {
      return record.getBindingValue(name, strict);
    }

    record = record.outer;
  }

  throw new GuestErrorSignal(
    'ReferenceError',
    `${String(name)} is not defined`,
  );
}
