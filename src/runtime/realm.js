import { EngineObject } from './object.js';
import { GlobalEnvironmentRecord } from './environment.js';
import {
  createFundamentalIntrinsics,
  defineGlobalValueProperties,
} from '../builtins/fundamental.js';

/**
 * @typedef {import('../builtins/fundamental.js').FundamentalIntrinsics} FundamentalIntrinsics
 */

/**
 * A realm owns a fresh intrinsic graph and a fresh global object/environment,
 * keeping every script execution isolated from the host and from other
 * realms. Nothing here reaches into host globals: the global object is a
 * plain `EngineObject` whose only properties are the ES5 global value
 * properties (`NaN`, `Infinity`, `undefined`) and whatever the running
 * script (or future built-in installers) adds to it.
 */
export class Realm {
  constructor() {
    /** @type {FundamentalIntrinsics} */
    this.intrinsics = createFundamentalIntrinsics();
    this.globalObject = new EngineObject(this.intrinsics.objectPrototype);
    defineGlobalValueProperties(this.globalObject);
    this.globalEnvironment = new GlobalEnvironmentRecord(this.globalObject);
  }
}

/**
 * @returns {Realm}
 */
export function createRealm() {
  return new Realm();
}
