import { EngineObject } from '../runtime/object.js';

/**
 * @typedef {{
 *   objectPrototype: EngineObject,
 *   functionPrototype: EngineObject,
 * }} FundamentalIntrinsics
 */

/**
 * Builds the minimal, per-realm intrinsic graph this milestone needs: the
 * root `%Object.prototype%` (whose own `[[Prototype]]` is `null`) and
 * `%Function.prototype%` (an ordinary object inheriting from
 * `%Object.prototype%`, standing in until function objects exist). Every
 * call returns brand-new `EngineObject` instances so realms never share
 * intrinsic identity.
 *
 * @returns {FundamentalIntrinsics}
 */
export function createFundamentalIntrinsics() {
  const objectPrototype = new EngineObject(null);
  const functionPrototype = new EngineObject(objectPrototype);

  return { objectPrototype, functionPrototype };
}
