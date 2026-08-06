import {
  EngineDate,
  MS_PER_MINUTE,
  dateFromTime,
  dateCallString,
  dateFromLocalArguments,
  dateUTC,
  formatISOString,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  formatUTCString,
  hourFromTime,
  makeDate,
  makeDay,
  makeTime,
  minFromTime,
  monthFromTime,
  parseDateString,
  secFromTime,
  timeClip,
  utcFromLocalTime,
  weekDay,
  yearFromTime,
  msFromTime,
} from '../runtime/date.js';
import {
  toInteger,
  toNumber,
  toObject,
  toPrimitive,
  toString,
} from '../runtime/conversion.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { isCallable } from '../runtime/descriptors.js';

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
  installDatePrototypeMethods(realm, datePrototype);

  return { datePrototype, dateConstructor };
}

/**
 * @param {Realm} realm
 * @param {EngineDate} datePrototype
 * @returns {void}
 */
function installDatePrototypeMethods(realm, datePrototype) {
  /** @type {(date: EngineDate) => number} */
  const local = (date) => localTime(date, realm);
  /** @type {(date: EngineDate) => number} */
  const utc = (date) => date.timeValue;
  /** @type {(name: string, field: (time: number) => number, useLocal?: boolean) => void} */
  const accessor = (name, field, useLocal = true) => {
    defineMethod(realm, datePrototype, name, 0, (thisValue) => {
      const date = requireDate(thisValue);
      const time = useLocal ? local(date) : utc(date);
      return Number.isFinite(time) ? field(time) : NaN;
    });
  };

  accessor('getTime', (time) => time, false);
  accessor('getFullYear', yearFromTime);
  accessor('getUTCFullYear', yearFromTime, false);
  accessor('getMonth', monthFromTime);
  accessor('getUTCMonth', monthFromTime, false);
  accessor('getDate', dateFromTime);
  accessor('getUTCDate', dateFromTime, false);
  accessor('getDay', weekDay);
  accessor('getUTCDay', weekDay, false);
  accessor('getHours', hourFromTime);
  accessor('getUTCHours', hourFromTime, false);
  accessor('getMinutes', minFromTime);
  accessor('getUTCMinutes', minFromTime, false);
  accessor('getSeconds', secFromTime);
  accessor('getUTCSeconds', secFromTime, false);
  accessor('getMilliseconds', msFromTime);
  accessor('getUTCMilliseconds', msFromTime, false);
  accessor('getYear', (time) => yearFromTime(time) - 1900);
  defineMethod(realm, datePrototype, 'getTimezoneOffset', 0, (thisValue) => {
    const date = requireDate(thisValue);
    if (!Number.isFinite(date.timeValue)) {
      return NaN;
    }

    const offset = realm.dateHost.timezoneOffset(date.timeValue);
    return Number.isFinite(offset) ? offset : NaN;
  });
  defineMethod(realm, datePrototype, 'toString', 0, (thisValue) =>
    formatLocalDateTime(requireDate(thisValue).timeValue, realm.dateHost),
  );
  defineMethod(realm, datePrototype, 'toDateString', 0, (thisValue) =>
    formatLocalDate(requireDate(thisValue).timeValue, realm.dateHost),
  );
  defineMethod(realm, datePrototype, 'toTimeString', 0, (thisValue) =>
    formatLocalTime(requireDate(thisValue).timeValue, realm.dateHost),
  );
  defineMethod(realm, datePrototype, 'toLocaleString', 0, (thisValue) =>
    formatLocalDateTime(requireDate(thisValue).timeValue, realm.dateHost),
  );
  defineMethod(realm, datePrototype, 'toLocaleDateString', 0, (thisValue) =>
    formatLocalDate(requireDate(thisValue).timeValue, realm.dateHost),
  );
  defineMethod(realm, datePrototype, 'toLocaleTimeString', 0, (thisValue) =>
    formatLocalTime(requireDate(thisValue).timeValue, realm.dateHost),
  );
  const toUTCString = realm.createNativeFunction({
    name: 'toUTCString',
    length: 0,
    call(thisValue) {
      return formatUTCString(requireDate(thisValue).timeValue);
    },
  });
  datePrototype.defineOwnProperty('toUTCString', {
    value: toUTCString,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  datePrototype.defineOwnProperty('toGMTString', {
    value: toUTCString,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  defineMethod(realm, datePrototype, 'toISOString', 0, (thisValue) => {
    const timeValue = requireDate(thisValue).timeValue;
    if (!Number.isFinite(timeValue)) {
      throw new GuestErrorSignal('RangeError', 'Invalid time value');
    }

    return formatISOString(timeValue);
  });
  defineMethod(realm, datePrototype, 'toJSON', 1, (thisValue) => {
    const object = toObject(realm, thisValue);
    const primitive = toPrimitive(object, 'number');
    if (typeof primitive === 'number' && !Number.isFinite(primitive)) {
      return null;
    }

    const toISOString = object.get('toISOString');
    if (!isCallable(toISOString)) {
      throw new GuestErrorSignal('TypeError', 'toISOString is not callable');
    }

    return toISOString.callFunction(object, []);
  });
  defineMethod(
    realm,
    datePrototype,
    'valueOf',
    0,
    (thisValue) => requireDate(thisValue).timeValue,
  );

  defineMethod(realm, datePrototype, 'setTime', 1, (thisValue, args) => {
    const date = requireDate(thisValue);
    date.timeValue = timeClip(toNumber(args[0]));
    return date.timeValue;
  });
  installDateSetters(realm, datePrototype);
}

/**
 * @param {unknown} thisValue
 * @returns {EngineDate}
 */
function requireDate(thisValue) {
  if (!(thisValue instanceof EngineDate)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Date method called on incompatible receiver',
    );
  }

  return thisValue;
}

/**
 * @param {EngineDate} date
 * @param {Realm} realm
 * @returns {number}
 */
function localTime(date, realm) {
  if (!Number.isFinite(date.timeValue)) {
    return NaN;
  }

  const offset = realm.dateHost.timezoneOffset(date.timeValue);
  return Number.isFinite(offset)
    ? date.timeValue - offset * MS_PER_MINUTE
    : NaN;
}

/**
 * @param {Realm} realm
 * @param {EngineDate} datePrototype
 * @returns {void}
 */
function installDateSetters(realm, datePrototype) {
  /** @type {(name: string, length: number, callback: (date: EngineDate, args: readonly unknown[]) => number) => void} */
  const set = (name, length, callback) => {
    defineMethod(realm, datePrototype, name, length, (thisValue, args) =>
      callback(requireDate(thisValue), args),
    );
  };
  /** @type {(name: string, length: number, local: boolean, start: number, recover?: boolean) => void} */
  const fieldSetter = (name, length, local, start, recover = false) => {
    set(name, length, (date, args) => {
      const values = [toNumber(args[0])];
      for (let index = 1; index < length && index < args.length; index += 1) {
        values.push(toNumber(args[index]));
      }
      const fields = dateFields(date, realm, local, recover);
      if (fields === undefined) {
        date.timeValue = NaN;
        return date.timeValue;
      }

      for (let index = 0; index < values.length; index += 1) {
        fields[start + index] = values[index];
      }
      return setDateFields(date, fields, realm, local);
    });
  };

  fieldSetter('setMilliseconds', 1, true, 6);
  fieldSetter('setUTCMilliseconds', 1, false, 6);
  fieldSetter('setSeconds', 2, true, 5);
  fieldSetter('setUTCSeconds', 2, false, 5);
  fieldSetter('setMinutes', 3, true, 4);
  fieldSetter('setUTCMinutes', 3, false, 4);
  fieldSetter('setHours', 4, true, 3);
  fieldSetter('setUTCHours', 4, false, 3);
  fieldSetter('setDate', 1, true, 2);
  fieldSetter('setUTCDate', 1, false, 2);
  fieldSetter('setMonth', 2, true, 1);
  fieldSetter('setUTCMonth', 2, false, 1);
  fieldSetter('setFullYear', 3, true, 0, true);
  fieldSetter('setUTCFullYear', 3, false, 0, true);
  set('setYear', 1, (date, args) => {
    let year = toNumber(args[0]);
    const fields = dateFields(date, realm, true, true);
    if (fields === undefined) {
      date.timeValue = NaN;
      return date.timeValue;
    }

    if (Number.isFinite(year)) {
      year = toInteger(year);
      if (year >= 0 && year <= 99) {
        year += 1900;
      }
    }
    fields[0] = year;
    return setDateFields(date, fields, realm, true);
  });
}

/**
 * @param {EngineDate} date
 * @param {Realm} realm
 * @param {boolean} local
 * @param {boolean} recoverInvalid
 * @returns {number[] | undefined}
 */
function dateFields(date, realm, local, recoverInvalid) {
  let time = date.timeValue;
  const recovering = !Number.isFinite(time);
  if (recovering) {
    if (!recoverInvalid) {
      return undefined;
    }
    time = 0;
  }

  if (local && !recovering) {
    time = localTimeValue(time, realm);
  }
  if (!Number.isFinite(time)) {
    return undefined;
  }

  return [
    yearFromTime(time),
    monthFromTime(time),
    dateFromTime(time),
    hourFromTime(time),
    minFromTime(time),
    secFromTime(time),
    msFromTime(time),
  ];
}

/**
 * @param {number} time
 * @param {Realm} realm
 * @returns {number}
 */
function localTimeValue(time, realm) {
  const offset = realm.dateHost.timezoneOffset(time);
  return Number.isFinite(offset) ? time - offset * MS_PER_MINUTE : NaN;
}

/**
 * @param {EngineDate} date
 * @param {number[]} fields
 * @param {Realm} realm
 * @param {boolean} local
 * @returns {number}
 */
function setDateFields(date, fields, realm, local) {
  const dateTime = makeDate(
    makeDay(fields[0], fields[1], fields[2]),
    makeTime(fields[3], fields[4], fields[5], fields[6]),
  );
  date.timeValue = timeClip(
    local ? utcFromLocalTime(dateTime, realm.dateHost) : dateTime,
  );
  return date.timeValue;
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
 * @returns {number}
 */
function dateValueFromArguments(realm, args) {
  if (args.length === 0) {
    return timeClip(realm.dateHost.now());
  }

  if (args.length === 1) {
    const value = args[0];
    const primitive = toPrimitive(value);
    return typeof primitive === 'string'
      ? parseDateString(primitive)
      : timeClip(toNumber(primitive));
  }

  return dateFromLocalArguments(args, realm.dateHost);
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
