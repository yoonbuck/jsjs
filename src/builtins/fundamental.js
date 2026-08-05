import { EngineObject } from '../runtime/object.js';

/**
 * @typedef {{
 *   objectPrototype: EngineObject,
 *   functionPrototype: EngineObject,
 *   arrayPrototype: EngineObject,
 * }} FundamentalIntrinsics
 */

/**
 * Builds the minimal, per-realm intrinsic graph this milestone needs: the
 * root `%Object.prototype%` (whose own `[[Prototype]]` is `null`) plus
 * `%Function.prototype%` and `%Array.prototype%`, ordinary objects
 * inheriting from `%Object.prototype%` that give the function and array
 * specializations a distinct per-realm prototype identity. None of them
 * carries its standard methods yet. Every call returns brand-new
 * `EngineObject` instances so realms never share intrinsic identity.
 *
 * @returns {FundamentalIntrinsics}
 */
export function createFundamentalIntrinsics() {
  const objectPrototype = new EngineObject(null);
  const functionPrototype = new EngineObject(objectPrototype);
  const arrayPrototype = new EngineObject(objectPrototype);

  return { objectPrototype, functionPrototype, arrayPrototype };
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
