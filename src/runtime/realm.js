import { EngineObject } from './object.js';
import { GlobalEnvironmentRecord } from './environment.js';
import { createNativeFunction } from '../builtins/shared.js';
import {
  createFundamentalIntrinsics,
  defineGlobalValueProperties,
} from '../builtins/fundamental.js';
import {
  createGuestError,
  createErrorIntrinsics,
  installErrorConstructors,
} from '../builtins/errors.js';
import {
  createObjectIntrinsics,
  installObjectConstructor,
} from '../builtins/object.js';
import {
  createFunctionIntrinsics,
  installFunctionConstructor,
} from '../builtins/function.js';
import {
  createArrayIntrinsics,
  installArrayConstructor,
} from '../builtins/array.js';
import {
  createPrimitiveWrapperIntrinsics,
  installPrimitiveWrapperConstructors,
} from '../builtins/primitive-wrappers.js';
import {
  createRegExpIntrinsics,
  installRegExpConstructor,
} from '../builtins/regexp.js';
import {
  createSymbolIntrinsics,
  installSymbolConstructor,
} from '../builtins/symbol.js';
import { createMathIntrinsics, installMathObject } from '../builtins/math.js';
import {
  createNumericGlobalIntrinsics,
  installNumericGlobals,
} from '../builtins/global-numeric.js';
import {
  createURIGlobalIntrinsics,
  installURIGlobals,
} from '../builtins/global-uri.js';
import {
  createEvalGlobalIntrinsics,
  installEvalGlobal,
} from '../builtins/global-eval.js';
import { createJSONIntrinsics, installJSONObject } from '../builtins/json.js';
import {
  createDateIntrinsics,
  installDateConstructor,
} from '../builtins/date.js';
import { GuestErrorSignal } from './completion.js';
import { StackGuard } from './stack-guard.js';
import { createDateHost } from './date.js';

/**
 * @typedef {import('../builtins/fundamental.js').FundamentalIntrinsics} FundamentalIntrinsics
 * @typedef {import('../builtins/errors.js').ErrorIntrinsics} ErrorIntrinsics
 * @typedef {{
 *   maxStackDepth?: number,
 *   dateHost?: Partial<import('./date.js').DateHost>,
 *   now?: () => number,
 *   clock?: () => number,
 *   standardTimezoneOffset?: number,
 *   standardTimeZoneOffset?: number,
 *   timezoneOffset?: (utcMilliseconds: number) => number,
 *   timeZoneOffset?: (utcMilliseconds: number) => number,
 * }} RealmOptions
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
  /**
   * @param {RealmOptions} [options]
   */
  constructor(options = {}) {
    /** @type {FundamentalIntrinsics & Partial<ErrorIntrinsics> & Record<string, unknown>} */
    this.intrinsics = /** @type {any} */ (createFundamentalIntrinsics());
    this.globalObject = new EngineObject(this.intrinsics.objectPrototype);
    defineGlobalValueProperties(this.globalObject);
    this.globalEnvironment = new GlobalEnvironmentRecord(this.globalObject);
    // The recursion boundary is built before any guest work can happen: every
    // activation and every evaluator frame in this realm consults it, so it
    // must outlive the intrinsic graph installed below.
    this.stackGuard = new StackGuard(options.maxStackDepth);
    this.dateHost = createDateHost({
      ...options,
      ...options.dateHost,
    });

    // Error intrinsics are created once the realm's global object and
    // environment exist so the resulting constructors/prototypes can be
    // published immediately and engine internals can reach them via
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
    const throwTypeErrorFunction = this.createNativeFunction({
      name: '',
      length: 0,
      call() {
        throw new GuestErrorSignal(
          'TypeError',
          'Restricted property access in strict mode',
        );
      },
    });
    // ES5.1 §13.2.3 / ES2015+ restricted-function-properties: the unique
    // [[ThrowTypeError]] intrinsic must be genuinely frozen — its `length` and
    // `name` own properties must be non-configurable even though ordinary
    // native functions now use configurable: true per ES2015. Re-define both
    // here explicitly before locking extensibility.
    throwTypeErrorFunction.defineOwnProperty('length', {
      value: 0,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    throwTypeErrorFunction.defineOwnProperty('name', {
      value: '',
      writable: false,
      enumerable: false,
      configurable: false,
    });
    throwTypeErrorFunction.preventExtensions();
    this.intrinsics.throwTypeErrorFunction = throwTypeErrorFunction;

    const objectIntrinsics = createObjectIntrinsics(this);
    Object.assign(this.intrinsics, objectIntrinsics);
    installObjectConstructor(this.globalObject, objectIntrinsics);

    const functionIntrinsics = createFunctionIntrinsics(this);
    Object.assign(this.intrinsics, functionIntrinsics);
    installFunctionConstructor(this.globalObject, functionIntrinsics);

    const arrayIntrinsics = createArrayIntrinsics(this);
    Object.assign(this.intrinsics, arrayIntrinsics);
    installArrayConstructor(this.globalObject, arrayIntrinsics);

    const primitiveWrapperIntrinsics = createPrimitiveWrapperIntrinsics(this);
    Object.assign(this.intrinsics, primitiveWrapperIntrinsics);
    installPrimitiveWrapperConstructors(
      this.globalObject,
      primitiveWrapperIntrinsics,
    );

    const regExpIntrinsics = createRegExpIntrinsics(this);
    Object.assign(this.intrinsics, regExpIntrinsics);
    installRegExpConstructor(this.globalObject, regExpIntrinsics);

    const symbolIntrinsics = createSymbolIntrinsics(this);
    Object.assign(this.intrinsics, symbolIntrinsics);
    installSymbolConstructor(this.globalObject, symbolIntrinsics);

    const mathIntrinsics = createMathIntrinsics(this);
    Object.assign(this.intrinsics, mathIntrinsics);
    installMathObject(this.globalObject, mathIntrinsics);

    const numericGlobalIntrinsics = createNumericGlobalIntrinsics(this);
    Object.assign(this.intrinsics, numericGlobalIntrinsics);
    installNumericGlobals(this.globalObject, numericGlobalIntrinsics);

    const uriGlobalIntrinsics = createURIGlobalIntrinsics(this);
    Object.assign(this.intrinsics, uriGlobalIntrinsics);
    installURIGlobals(this.globalObject, uriGlobalIntrinsics);

    const evalGlobalIntrinsics = createEvalGlobalIntrinsics(this);
    Object.assign(this.intrinsics, evalGlobalIntrinsics);
    installEvalGlobal(this.globalObject, evalGlobalIntrinsics);

    const jsonIntrinsics = createJSONIntrinsics(this);
    Object.assign(this.intrinsics, jsonIntrinsics);
    installJSONObject(this.globalObject, jsonIntrinsics);

    const dateIntrinsics = createDateIntrinsics(this);
    Object.assign(this.intrinsics, dateIntrinsics);
    installDateConstructor(this.globalObject, dateIntrinsics);
  }

  /**
   * @param {import('../builtins/shared.js').NativeFunctionOptions} options
   * @returns {import('../builtins/shared.js').NativeFunction}
   */
  createNativeFunction(options) {
    return createNativeFunction(this, options);
  }

  /**
   * @param {'EvalError' | 'TypeError' | 'ReferenceError' | 'SyntaxError' | 'RangeError' | 'URIError' | 'Error'} typeName
   * @param {string} message
   * @returns {EngineObject}
   */
  createGuestError(typeName, message) {
    return createGuestError(this, typeName, message);
  }
}

/**
 * @param {RealmOptions} [options]
 * @returns {Realm}
 */
export function createRealm(options = {}) {
  return new Realm(options);
}
