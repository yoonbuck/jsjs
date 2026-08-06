import {
  EngineDate,
  dateCallString,
  dateFromLocalArguments,
  dateUTC,
  parseDateString,
  timeClip,
} from '../runtime/date.js';
import { toNumber, toPrimitive, toString } from '../runtime/conversion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 *
 * @typedef {{
 *   datePrototype: import('../runtime/object.js').EngineObject,
 *   dateConstructor: import('./shared.js').NativeFunction,
 * }} DateIntrinsics
 */

/**
 * @param {Realm} realm
 * @returns {DateIntrinsics}
 */
export function createDateIntrinsics(realm) {
  const datePrototype = new EngineDate(realm.intrinsics.objectPrototype, NaN);
  const defaultToString = realm.intrinsics.objectPrototype.get('toString');
  const defaultValueOf = realm.intrinsics.objectPrototype.get('valueOf');

  /**
   * @param {readonly unknown[]} args
   * @returns {EngineDate}
   */
  function constructDate(args) {
    return new EngineDate(
      datePrototype,
      dateValueFromArguments(
        realm,
        args,
        datePrototype,
        defaultToString,
        defaultValueOf,
      ),
    );
  }

  const dateConstructor = realm.createNativeFunction({
    name: 'Date',
    length: 7,
    prototype: datePrototype,
    call() {
      return dateCallString(timeClip(realm.dateHost.now()), realm.dateHost);
    },
    construct(args) {
      return constructDate(args);
    },
  });

  datePrototype.defineOwnProperty('constructor', {
    value: dateConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  defineMethod(realm, dateConstructor, 'parse', 1, (_thisValue, args) =>
    parseDateString(toString(args[0]), realm.dateHost),
  );
  defineMethod(realm, dateConstructor, 'UTC', 7, (_thisValue, args) =>
    dateUTC(args),
  );
  defineMethod(realm, dateConstructor, 'now', 0, () =>
    timeClip(realm.dateHost.now()),
  );

  return { datePrototype, dateConstructor };
}

/**
 * @param {import('../runtime/object.js').EngineObject} globalObject
 * @param {DateIntrinsics} intrinsics
 * @returns {void}
 */
export function installDateConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Date', {
    value: intrinsics.dateConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {Realm} realm
 * @param {readonly unknown[]} args
 * @param {EngineDate} datePrototype
 * @param {unknown} defaultToString
 * @param {unknown} defaultValueOf
 * @returns {number}
 */
function dateValueFromArguments(
  realm,
  args,
  datePrototype,
  defaultToString,
  defaultValueOf,
) {
  if (args.length === 0) {
    return timeClip(realm.dateHost.now());
  }

  if (args.length === 1) {
    const value = args[0];

    if (
      value instanceof EngineDate &&
      !hasDateConversionOverride(
        value,
        defaultToString,
        defaultValueOf,
      )
    ) {
      return value.timeValue;
    }

    const primitive = toPrimitive(value, 'string');
    return typeof primitive === 'string'
      ? parseDateString(primitive, realm.dateHost)
      : timeClip(toNumber(primitive));
  }

  return dateFromLocalArguments(args, realm.dateHost);
}

/**
 * Date's conversion methods are intentionally out of scope. A plain engine
 * Date therefore retains its internal-value clone path, while user-installed
 * methods expose the ES5 String-hint conversion observable to guest code.
 *
 * @param {unknown} value
 * @param {unknown} defaultToString
 * @param {unknown} defaultValueOf
 * @returns {boolean}
 */
function hasDateConversionOverride(
  value,
  defaultToString,
  defaultValueOf,
) {
  if (!(value instanceof EngineDate)) {
    return false;
  }

  return (
    hasModifiedConversionMethod(value, 'toString', defaultToString) ||
    hasModifiedConversionMethod(value, 'valueOf', defaultValueOf)
  );
}

/**
 * @param {EngineDate} value
 * @param {'toString' | 'valueOf'} name
 * @param {unknown} defaultMethod
 * @returns {boolean}
 */
function hasModifiedConversionMethod(value, name, defaultMethod) {
  const descriptor = value.getProperty(name);
  return (
    descriptor === undefined ||
    !('value' in descriptor) ||
    descriptor.value !== defaultMethod
  );
}

/**
 * @param {Realm} realm
 * @param {import('../runtime/object.js').EngineObject} target
 * @param {string} name
 * @param {number} length
 * @param {import('./shared.js').NativeFunctionOptions['call']} call
 * @returns {void}
 */
function defineMethod(realm, target, name, length, call) {
  target.defineOwnProperty(name, {
    value: realm.createNativeFunction({ name, length, call }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
