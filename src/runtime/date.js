import { toInteger, toNumber } from './conversion.js';
import { EngineObject } from './object.js';

/** ECMA-262 5.1 §15.9.1 constants. */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const TIME_CLIP_LIMIT = 8.64e15;

const DAYS_PER_400_YEARS = 146097;
const MONTH_STARTS = Object.freeze([
  Object.freeze([0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]),
  Object.freeze([0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]),
]);

/**
 * ECMA-262 5.1 §15.9.1.2 Day(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function day(time) {
  return Math.floor(time / MS_PER_DAY);
}

/**
 * ECMA-262 5.1 §15.9.1.3 TimeWithinDay(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function timeWithinDay(time) {
  return modulo(time, MS_PER_DAY);
}

/**
 * ECMA-262 5.1 §15.9.1.10 HourFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function hourFromTime(time) {
  return Math.floor(timeWithinDay(time) / MS_PER_HOUR);
}

/**
 * ECMA-262 5.1 §15.9.1.11 MinFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function minFromTime(time) {
  return Math.floor(modulo(time, MS_PER_HOUR) / MS_PER_MINUTE);
}

/**
 * ECMA-262 5.1 §15.9.1.12 SecFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function secFromTime(time) {
  return Math.floor(modulo(time, MS_PER_MINUTE) / MS_PER_SECOND);
}

/**
 * ECMA-262 5.1 §15.9.1.13 msFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function msFromTime(time) {
  return modulo(time, MS_PER_SECOND);
}

/**
 * ECMA-262 5.1 §15.9.1.6 WeekDay(t), where Thursday is 4 because 1970-01-01
 * was a Thursday and Sunday is 0.
 *
 * @param {number} time
 * @returns {number}
 */
export function weekDay(time) {
  return modulo(day(time) + 4, 7);
}

/**
 * ECMA-262 5.1 §15.9.1.3 DaysInYear(y).
 *
 * @param {number} year
 * @returns {number}
 */
export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/**
 * ECMA-262 5.1 §15.9.1.3 DayFromYear(y).
 *
 * @param {number} year
 * @returns {number}
 */
export function dayFromYear(year) {
  return (
    365 * (year - 1970) +
    Math.floor((year - 1969) / 4) -
    Math.floor((year - 1901) / 100) +
    Math.floor((year - 1601) / 400)
  );
}

/**
 * ECMA-262 5.1 §15.9.1.3 TimeFromYear(y).
 *
 * @param {number} year
 * @returns {number}
 */
export function timeFromYear(year) {
  return dayFromYear(year) * MS_PER_DAY;
}

/**
 * ECMA-262 5.1 §15.9.1.3 YearFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function yearFromTime(time) {
  if (!Number.isFinite(time)) {
    return NaN;
  }

  const dayCount = day(time);
  const cycle = Math.floor(dayCount / DAYS_PER_400_YEARS);
  let year = 1970 + cycle * 400;
  let remainingDays = dayCount - cycle * DAYS_PER_400_YEARS;

  while (remainingDays >= daysInYear(year)) {
    remainingDays -= daysInYear(year);
    year += 1;
  }

  return year;
}

/**
 * ECMA-262 5.1 §15.9.1.3 InLeapYear(t).
 *
 * @param {number} time
 * @returns {0 | 1}
 */
export function inLeapYear(time) {
  return daysInYear(yearFromTime(time)) === 366 ? 1 : 0;
}

/**
 * ECMA-262 5.1 §15.9.1.4 DayWithinYear(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function dayWithinYear(time) {
  return day(time) - dayFromYear(yearFromTime(time));
}

/**
 * ECMA-262 5.1 §15.9.1.4 MonthFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function monthFromTime(time) {
  const dayInYear = dayWithinYear(time);
  const starts = MONTH_STARTS[inLeapYear(time)];

  for (let month = starts.length - 1; month >= 0; month -= 1) {
    if (dayInYear >= starts[month]) {
      return month;
    }
  }

  return 0;
}

/**
 * ECMA-262 5.1 §15.9.1.5 DateFromTime(t).
 *
 * @param {number} time
 * @returns {number}
 */
export function dateFromTime(time) {
  const month = monthFromTime(time);
  return dayWithinYear(time) - MONTH_STARTS[inLeapYear(time)][month] + 1;
}

/**
 * ECMA-262 5.1 §15.9.1.11 MakeTime(hour, min, sec, ms).
 *
 * @param {unknown} hour
 * @param {unknown} min
 * @param {unknown} sec
 * @param {unknown} ms
 * @returns {number}
 */
export function makeTime(hour, min, sec, ms) {
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(min) ||
    !Number.isFinite(sec) ||
    !Number.isFinite(ms)
  ) {
    return NaN;
  }

  const h = toInteger(hour);
  const m = toInteger(min);
  const s = toInteger(sec);
  const milli = toInteger(ms);

  return ((h * 60 + m) * 60 + s) * MS_PER_SECOND + milli;
}

/**
 * ECMA-262 5.1 §15.9.1.12 MakeDay(year, month, date).
 *
 * @param {unknown} year
 * @param {unknown} month
 * @param {unknown} date
 * @returns {number}
 */
export function makeDay(year, month, date) {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(date)
  ) {
    return NaN;
  }

  const y = toInteger(year);
  const m = toInteger(month);
  const dt = toInteger(date);
  const normalizedYear = y + Math.floor(m / 12);
  const normalizedMonth = modulo(m, 12);
  const firstDay =
    dayFromYear(normalizedYear) +
    MONTH_STARTS[isLeapYear(normalizedYear) ? 1 : 0][normalizedMonth];
  const dayNumber = firstDay + dt - 1;

  return Number.isFinite(dayNumber) ? dayNumber : NaN;
}

/**
 * ECMA-262 5.1 §15.9.1.13 MakeDate(day, time).
 *
 * @param {unknown} dayValue
 * @param {unknown} timeValue
 * @returns {number}
 */
export function makeDate(dayValue, timeValue) {
  if (
    typeof dayValue !== 'number' ||
    typeof timeValue !== 'number' ||
    !Number.isFinite(dayValue) ||
    !Number.isFinite(timeValue)
  ) {
    return NaN;
  }

  const dateTime = dayValue * MS_PER_DAY + timeValue;
  return Number.isFinite(dateTime) ? dateTime : NaN;
}

/**
 * ECMA-262 5.1 §15.9.1.14 TimeClip(time).
 *
 * @param {unknown} time
 * @returns {number}
 */
export function timeClip(time) {
  if (
    typeof time !== 'number' ||
    !Number.isFinite(time) ||
    Math.abs(time) > TIME_CLIP_LIMIT
  ) {
    return NaN;
  }

  return toInteger(time);
}

/**
 * @param {number} dividend
 * @param {number} divisor
 * @returns {number}
 */
function modulo(dividend, divisor) {
  const remainder = dividend % divisor;

  if (Object.is(remainder, -0) || remainder === 0) {
    return 0;
  }

  return remainder < 0 ? remainder + divisor : remainder;
}

/**
 * @param {number} year
 * @returns {boolean}
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * An engine Date object. Its only date-specific state is the clipped UTC
 * millisecond value; public accessors and formatting live in later Date
 * milestones.
 */
export class EngineDate extends EngineObject {
  /**
   * @param {EngineObject} prototype
   * @param {number} timeValue
   */
  constructor(prototype, timeValue) {
    super(prototype, 'Date');
    this.timeValue = timeValue;
  }
}

/**
 * @typedef {{
 *   now: () => number,
 *   standardTimezoneOffset: number,
 *   timezoneOffset: (utcMilliseconds: number) => number,
 * }} DateHost
 */

/**
 * Creates the only boundary between Date's algorithms and host-dependent
 * clock/time-zone facilities. `timezoneOffset` uses the `getTimezoneOffset`
 * convention: minutes to add to local time to obtain UTC. An explicitly
 * injected `standardTimezoneOffset` must be that stable standard-time offset.
 * When omitted, it is the greater offset from deterministic January and July
 * UTC probes; daylight saving reduces this convention's offset in either
 * hemisphere. Adapters that do not follow that convention must inject it.
 *
 * @param {Partial<DateHost> & {
 *   clock?: () => number,
 *   standardTimeZoneOffset?: number,
 *   timeZoneOffset?: (utcMilliseconds: number) => number,
 * }} [adapter]
 * @returns {DateHost}
 */
export function createDateHost(adapter = {}) {
  const now = adapter.now ?? adapter.clock ?? (() => Date.now());
  const timezoneOffset =
    adapter.timezoneOffset ??
    adapter.timeZoneOffset ??
    ((utcMilliseconds) => new Date(utcMilliseconds).getTimezoneOffset());
  const standardTimezoneOffset =
    adapter.standardTimezoneOffset ??
    adapter.standardTimeZoneOffset ??
    Math.max(timezoneOffset(0), timezoneOffset(181 * MS_PER_DAY));

  if (
    typeof now !== 'function' ||
    typeof timezoneOffset !== 'function' ||
    !Number.isFinite(standardTimezoneOffset)
  ) {
    throw new TypeError('Date host adapters must be functions');
  }

  return { now, standardTimezoneOffset, timezoneOffset };
}

/**
 * Builds a UTC Date value from the constructor's calendar-field overload.
 *
 * @param {readonly unknown[]} args
 * @param {DateHost} host
 * @returns {number}
 */
export function dateFromLocalArguments(args, host) {
  const year = toNumberValue(args[0]);
  const month = toNumberValue(args[1]);
  const date = args.length > 2 ? toNumberValue(args[2]) : 1;
  const hour = args.length > 3 ? toNumberValue(args[3]) : 0;
  const minute = args.length > 4 ? toNumberValue(args[4]) : 0;
  const second = args.length > 5 ? toNumberValue(args[5]) : 0;
  const millisecond = args.length > 6 ? toNumberValue(args[6]) : 0;
  const localTime = dateFromComponents(
    year,
    month,
    date,
    hour,
    minute,
    second,
    millisecond,
  );

  return timeClip(utcFromLocalTime(localTime, host));
}

/**
 * Builds a UTC Date value for Date.UTC. Month is required by ES5; only the
 * trailing fields receive defaults.
 *
 * @param {readonly unknown[]} args
 * @returns {number}
 */
export function dateUTC(args) {
  const year = toNumberValue(args[0]);
  const month = toNumberValue(args[1]);
  const date = args.length > 2 ? toNumberValue(args[2]) : 1;
  const hour = args.length > 3 ? toNumberValue(args[3]) : 0;
  const minute = args.length > 4 ? toNumberValue(args[4]) : 0;
  const second = args.length > 5 ? toNumberValue(args[5]) : 0;
  const millisecond = args.length > 6 ? toNumberValue(args[6]) : 0;

  return timeClip(
    dateFromComponents(year, month, date, hour, minute, second, millisecond),
  );
}

/**
 * Parses the ES5 ISO date-time grammar plus this engine's deterministic Date
 * call form. Parsing is deliberately independent of host Date.parse.
 *
 * @param {string} source
 * @param {DateHost} _host
 * @returns {number}
 */
export function parseDateString(source, _host) {
  const iso =
    /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/.exec(
      source,
    );

  if (iso !== null) {
    const [
      ,
      yearText,
      monthText,
      dateText,
      hourText,
      minuteText,
      secondText,
      millisecondText,
      zone,
    ] = iso;
    const year = Number(yearText);
    const month = monthText === undefined ? 1 : Number(monthText);
    const date = dateText === undefined ? 1 : Number(dateText);
    const hour = hourText === undefined ? 0 : Number(hourText);
    const minute = minuteText === undefined ? 0 : Number(minuteText);
    const second = secondText === undefined ? 0 : Number(secondText);
    const millisecond =
      millisecondText === undefined ? 0 : millisecondsFromText(millisecondText);

    if (
      !validDateFields(year, month, date, hour, minute, second, millisecond)
    ) {
      return NaN;
    }

    const localTime = dateFromComponents(
      year,
      month - 1,
      date,
      hour,
      minute,
      second,
      millisecond,
      false,
    );

    if (zone === undefined) {
      return timeClip(localTime);
    }

    if (zone === 'Z') {
      return timeClip(localTime);
    }

    const sign = zone[0] === '+' ? 1 : -1;
    const zoneHour = Number(zone[1] + zone[2]);
    const zoneMinute = Number(
      zone.length === 6 ? zone[4] + zone[5] : zone[3] + zone[4],
    );

    if (zoneHour > 23 || zoneMinute > 59) {
      return NaN;
    }

    return timeClip(
      localTime - sign * (zoneHour * 60 + zoneMinute) * MS_PER_MINUTE,
    );
  }

  const utcDisplay =
    /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (-?\d{4,}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      source,
    );

  if (utcDisplay !== null) {
    const [, dateText, monthName, yearText, hourText, minuteText, secondText] =
      utcDisplay;
    return parseDisplayDateFields(
      yearText,
      monthName,
      dateText,
      hourText,
      minuteText,
      secondText,
      0,
    );
  }

  const display =
    /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) (-?\d{4,}) (\d{2}):(\d{2}):(\d{2}) GMT([+-])(\d{2})(\d{2})(?: \(UTC\))?$/.exec(
      source,
    );

  if (display === null) {
    return NaN;
  }

  const [
    ,
    monthName,
    dateText,
    yearText,
    hourText,
    minuteText,
    secondText,
    signText,
    offsetHourText,
    offsetMinuteText,
  ] = display;
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);

  if (offsetHour > 23 || offsetMinute > 59) {
    return NaN;
  }

  const offset = (offsetHour * 60 + offsetMinute) * MS_PER_MINUTE;
  return parseDisplayDateFields(
    yearText,
    monthName,
    dateText,
    hourText,
    minuteText,
    secondText,
    signText === '+' ? offset : -offset,
  );
}

/**
 * @param {string} yearText
 * @param {string} monthName
 * @param {string} dateText
 * @param {string} hourText
 * @param {string} minuteText
 * @param {string} secondText
 * @param {number} offset
 * @returns {number}
 */
function parseDisplayDateFields(
  yearText,
  monthName,
  dateText,
  hourText,
  minuteText,
  secondText,
  offset,
) {
  const year = Number(yearText);
  const month = monthNumber(monthName);
  const date = Number(dateText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (!validDateFields(year, month, date, hour, minute, second, 0)) {
    return NaN;
  }

  return timeClip(
    dateFromComponents(year, month - 1, date, hour, minute, second, 0) - offset,
  );
}

/**
 * Produces Date's deterministic local date-time display.
 *
 * @param {number} utcMilliseconds
 * @param {DateHost} host
 * @returns {string}
 */
export function dateCallString(utcMilliseconds, host) {
  return formatLocalDateTime(utcMilliseconds, host);
}

/**
 * @param {number} utcMilliseconds
 * @param {DateHost} host
 * @returns {string}
 */
export function formatLocalDateTime(utcMilliseconds, host) {
  const parts = localFormatParts(utcMilliseconds, host);
  return parts === undefined
    ? 'Invalid Date'
    : `${formatDateParts(parts.time)} ${formatTimeParts(parts.time)} GMT${formatOffset(
        parts.offset,
      )} (UTC)`;
}

/**
 * @param {number} utcMilliseconds
 * @param {DateHost} host
 * @returns {string}
 */
export function formatLocalDate(utcMilliseconds, host) {
  const parts = localFormatParts(utcMilliseconds, host);
  return parts === undefined ? 'Invalid Date' : formatDateParts(parts.time);
}

/**
 * @param {number} utcMilliseconds
 * @param {DateHost} host
 * @returns {string}
 */
export function formatLocalTime(utcMilliseconds, host) {
  const parts = localFormatParts(utcMilliseconds, host);
  return parts === undefined
    ? 'Invalid Date'
    : `${formatTimeParts(parts.time)} GMT${formatOffset(parts.offset)} (UTC)`;
}

/**
 * @param {number} utcMilliseconds
 * @returns {string}
 */
export function formatUTCString(utcMilliseconds) {
  if (!Number.isFinite(utcMilliseconds)) {
    return 'Invalid Date';
  }

  return `${WEEKDAY_NAMES[weekDay(utcMilliseconds)]}, ${pad(
    dateFromTime(utcMilliseconds),
  )} ${MONTH_NAMES[monthFromTime(utcMilliseconds)]} ${formatYear(
    yearFromTime(utcMilliseconds),
  )} ${formatTimeParts(utcMilliseconds)} GMT`;
}

/**
 * @param {number} utcMilliseconds
 * @returns {string}
 */
export function formatISOString(utcMilliseconds) {
  if (!Number.isFinite(utcMilliseconds)) {
    return 'Invalid Date';
  }

  return `${formatISOYear(yearFromTime(utcMilliseconds))}-${pad(
    monthFromTime(utcMilliseconds) + 1,
  )}-${pad(dateFromTime(utcMilliseconds))}T${formatTimeParts(
    utcMilliseconds,
  )}.${pad(msFromTime(utcMilliseconds), 3)}Z`;
}

/**
 * @param {number} utcMilliseconds
 * @param {DateHost} host
 * @returns {{ time: number, offset: number } | undefined}
 */
function localFormatParts(utcMilliseconds, host) {
  if (!Number.isFinite(utcMilliseconds)) {
    return undefined;
  }

  const offset = host.timezoneOffset(utcMilliseconds);
  const time = utcMilliseconds - offset * MS_PER_MINUTE;
  return Number.isFinite(offset) && Number.isFinite(time)
    ? { time, offset }
    : undefined;
}

/**
 * @param {number} time
 * @returns {string}
 */
function formatDateParts(time) {
  return `${WEEKDAY_NAMES[weekDay(time)]} ${MONTH_NAMES[monthFromTime(time)]} ${pad(
    dateFromTime(time),
  )} ${formatYear(yearFromTime(time))}`;
}

/**
 * @param {number} time
 * @returns {string}
 */
function formatTimeParts(time) {
  return `${pad(hourFromTime(time))}:${pad(minFromTime(time))}:${pad(
    secFromTime(time),
  )}`;
}

/**
 * @param {number} offset
 * @returns {string}
 */
function formatOffset(offset) {
  const magnitude = Math.abs(offset);
  return `${offset <= 0 ? '+' : '-'}${pad(
    Math.floor(magnitude / 60),
  )}${pad(magnitude % 60)}`;
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} date
 * @param {number} hour
 * @param {number} minute
 * @param {number} second
 * @param {number} millisecond
 * @param {boolean} [adjustTwoDigitYear=true]
 * @returns {number}
 */
function dateFromComponents(
  year,
  month,
  date,
  hour,
  minute,
  second,
  millisecond,
  adjustTwoDigitYear = true,
) {
  if (!Number.isFinite(year)) {
    return NaN;
  }

  const normalizedYear = toInteger(year);
  const calendarYear =
    adjustTwoDigitYear && normalizedYear >= 0 && normalizedYear <= 99
      ? normalizedYear + 1900
      : normalizedYear;
  return makeDate(
    makeDay(calendarYear, month, date),
    makeTime(hour, minute, second, millisecond),
  );
}

/**
 * @param {number} localTime
 * @param {DateHost} host
 * @returns {number}
 */
export function utcFromLocalTime(localTime, host) {
  if (!Number.isFinite(localTime)) {
    return NaN;
  }

  const utcMilliseconds = timeClip(
    localTime + host.standardTimezoneOffset * MS_PER_MINUTE,
  );
  const offset = host.timezoneOffset(utcMilliseconds);
  return Number.isFinite(offset) ? localTime + offset * MS_PER_MINUTE : NaN;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toNumberValue(value) {
  return toNumber(value);
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} date
 * @param {number} hour
 * @param {number} minute
 * @param {number} second
 * @param {number} millisecond
 * @returns {boolean}
 */
function validDateFields(year, month, date, hour, minute, second, millisecond) {
  if (
    month < 1 ||
    month > 12 ||
    date < 1 ||
    date > daysInYear(year) ||
    hour > 24 ||
    minute > 59 ||
    second > 59 ||
    millisecond > 999
  ) {
    return false;
  }

  if (hour === 24 && (minute !== 0 || second !== 0 || millisecond !== 0)) {
    return false;
  }

  return date <= dateFromMonthLength(year, month);
}

/**
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
function dateFromMonthLength(year, month) {
  const starts = MONTH_STARTS[isLeapYear(year) ? 1 : 0];
  return month === 12
    ? daysInYear(year) - starts[month - 1]
    : starts[month] - starts[month - 1];
}

/**
 * @param {number} value
 * @returns {string}
 */
function pad(value, width = 2) {
  let result = String(value);
  while (result.length < width) {
    result = `0${result}`;
  }
  return result;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatYear(value) {
  return value < 0 ? `-${pad(-value, 4)}` : pad(value, 4);
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatISOYear(value) {
  if (value >= 0 && value <= 9999) {
    return pad(value, 4);
  }

  return `${value < 0 ? '-' : '+'}${pad(Math.abs(value), 6)}`;
}

/**
 * @param {string} text
 * @returns {number}
 */
function millisecondsFromText(text) {
  let value = 0;

  for (let index = 0; index < text.length; index += 1) {
    value = value * 10 + Number(text[index]);
  }

  for (let index = text.length; index < 3; index += 1) {
    value *= 10;
  }

  return value;
}

/**
 * @param {string} name
 * @returns {number}
 */
function monthNumber(name) {
  for (let index = 0; index < MONTH_NAMES.length; index += 1) {
    if (MONTH_NAMES[index] === name) {
      return index + 1;
    }
  }

  return 0;
}

const WEEKDAY_NAMES = Object.freeze([
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
]);
const MONTH_NAMES = Object.freeze([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]);
