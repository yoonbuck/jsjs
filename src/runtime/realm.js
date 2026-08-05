import { EngineObject } from './object.js';
import { EngineFunction } from './function-object.js';
import { GlobalEnvironmentRecord } from './environment.js';
import {
  createFundamentalIntrinsics,
  defineGlobalValueProperties,
} from '../builtins/fundamental.js';
import {
  createErrorIntrinsics,
  installErrorConstructors,
} from '../builtins/errors.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('../builtins/fundamental.js').FundamentalIntrinsics} FundamentalIntrinsics
 * @typedef {import('../builtins/errors.js').ErrorIntrinsics} ErrorIntrinsics
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
    /** @type {FundamentalIntrinsics & Partial<ErrorIntrinsics> & Record<string, unknown>} */
    this.intrinsics = /** @type {any} */ (createFundamentalIntrinsics());
    this.globalObject = new EngineObject(this.intrinsics.objectPrototype);
    defineGlobalValueProperties(this.globalObject);
    this.globalEnvironment = new GlobalEnvironmentRecord(this.globalObject);

    // Error intrinsics are created after the global environment exists so
    // error constructor EngineFunction instances can reference it as their
    // lexical scope. The resulting prototypes and constructors are merged
    // into the intrinsics map so engine internals can reach them via
    // `realm.intrinsics.typeErrorPrototype` etc.
    const errorIntrinsics = createErrorIntrinsics(this);
    Object.assign(this.intrinsics, errorIntrinsics);
    installErrorConstructors(this.globalObject, errorIntrinsics);

    // The %ThrowTypeError% intrinsic (ECMA-262 13.2 strict-function steps and
    // 10.6 strict-arguments step): a single per-realm native function that
    // always throws a guest TypeError. Shared by every strict function's
    // "caller"/"arguments" accessor pairs and every strict arguments object's
    // "caller"/"callee" accessors. Created after error intrinsics exist so
    // the thrown error can be a proper guest TypeError.
    this.intrinsics.throwTypeErrorFunction = new EngineFunction({
      realm: this,
      parameterNames: [],
      scope: this.globalEnvironment,
      strict: false,
      execute() {
        throw new GuestErrorSignal(
          'TypeError',
          'Restricted property access in strict mode',
        );
      },
    });
  }
}

/**
 * @returns {Realm}
 */
export function createRealm() {
  return new Realm();
}
