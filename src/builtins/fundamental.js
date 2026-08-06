import { EngineObject } from '../runtime/object.js';
import { EngineArray } from '../runtime/array-object.js';
import { EnginePrimitiveObject } from '../runtime/primitive-object.js';
import { GuestErrorSignal } from '../runtime/completion.js';

/**
 * @typedef {{
 *   objectPrototype: EngineObject,
 *   functionPrototype: EngineObject,
 *   arrayPrototype: EngineObject,
 *   stringPrototype: EnginePrimitiveObject,
 *   numberPrototype: EnginePrimitiveObject,
 *   booleanPrototype: EnginePrimitiveObject,
 * }} FundamentalIntrinsics
 */

/**
 * Builds the minimal, per-realm intrinsic graph this milestone needs: the
 * root `%Object.prototype%` (whose own `[[Prototype]]` is `null`) plus
 * `%Function.prototype%`, `%Array.prototype%`, and the boxed-primitive
 * wrapper prototypes `%String.prototype%`, `%Number.prototype%`, and
 * `%Boolean.prototype%` — ordinary objects inheriting from
 * `%Object.prototype%` that give each specialization a distinct per-realm
 * prototype identity. None of them carries its standard methods yet (the
 * wrapper prototypes are created here, ahead of their constructors, so
 * `ToObject` and autoboxing can resolve `realm.intrinsics.stringPrototype`
 * etc. before `builtins/primitive-wrappers.js` finishes wiring the
 * constructors and methods onto them). Every call returns brand-new
 * `EngineObject` instances so realms never share intrinsic identity.
 *
 * @returns {FundamentalIntrinsics}
 */
export function createFundamentalIntrinsics() {
  const objectPrototype = new EngineObject(null);
  const functionPrototype = new IntrinsicFunctionPrototype(objectPrototype);
  const arrayPrototype = new EngineArray(objectPrototype);
  const stringPrototype = new EnginePrimitiveObject(objectPrototype, '');
  const numberPrototype = new EnginePrimitiveObject(objectPrototype, 0);
  const booleanPrototype = new EnginePrimitiveObject(objectPrototype, false);

  return {
    objectPrototype,
    functionPrototype,
    arrayPrototype,
    stringPrototype,
    numberPrototype,
    booleanPrototype,
  };
}

class IntrinsicFunctionPrototype extends EngineObject {
  /**
   * @param {EngineObject} objectPrototype
   */
  constructor(objectPrototype) {
    super(objectPrototype, 'Function');
    this._isConstructor = false;
    this.defineOwnProperty('length', {
      value: 0,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.defineOwnProperty('name', {
      value: '',
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  /**
   * @returns {undefined}
   */
  callFunction() {
    return undefined;
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

    let current = value.getPrototype();

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
 * Installs ECMA-262 15.1.1's global value properties (`NaN`, `Infinity`,
 * `undefined`) on `globalObject`, each a non-writable, non-enumerable,
 * non-configurable data property. These are plain values, not intrinsic
 * objects/functions, but scripts reference them as ordinary identifiers
 * (`NaN`, `Infinity`, `undefined` are `Identifier` nodes, not `Literal`
 * nodes), so the evaluator needs them present on every realm's global
 * object to resolve comparisons and coercions scripts commonly rely on.
 *
 * @param {EngineObject} globalObject
 * @returns {void}
 */
export function defineGlobalValueProperties(globalObject) {
  /** @type {[string, unknown][]} */
  const properties = [
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['undefined', undefined],
  ];

  for (const [name, value] of properties) {
    globalObject.defineOwnProperty(name, {
      value,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
}
