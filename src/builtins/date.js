import {
  EngineDate,
  dateCallString,
  dateFromLocalArguments,
  dateUTC,
  parseDateString,
  timeClip,
} from '../runtime/date.js';
import { toNumber, toPrimitive, toString } from '../runtime/conversion.js';

/** @typedef {import('../runtime/object.js').EngineObject} EngineObject */

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 *
 * @typedef {{
 *   datePrototype: EngineObject,
 *   dateConstructor: import('./shared.js').NativeFunction,
 * }} DateIntrinsics
 */

/**
 * @param {Realm} realm
 * @returns {DateIntrinsics}
 */
export function createDateIntrinsics(realm) {
  const datePrototype = new EngineDate(realm.intrinsics.objectPrototype, NaN);

  /**
   * @param {readonly unknown[]} args
   * @returns {EngineDate}
   */
  function constructDate(args) {
    return new EngineDate(datePrototype, dateValueFromArguments(realm, args));
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
    parseDateString(toString(args[0])),
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
 * @param {EngineObject} globalObject
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
 * @returns {number}
 */
function dateValueFromArguments(realm, args) {
  if (args.length === 0) {
    return timeClip(realm.dateHost.now());
  }

  if (args.length === 1) {
    const value = args[0];

    const primitive = toPrimitive(value, 'string');
    return typeof primitive === 'string'
      ? parseDateString(primitive)
      : timeClip(toNumber(primitive));
  }

  return dateFromLocalArguments(args, realm.dateHost);
}

/**
 * @param {Realm} realm
 * @param {EngineObject} target
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
