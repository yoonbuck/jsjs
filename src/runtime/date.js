import { toInteger } from './conversion.js';

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
  if (!Number.isFinite(dayValue) || !Number.isFinite(timeValue)) {
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
  if (!Number.isFinite(time) || Math.abs(time) > TIME_CLIP_LIMIT) {
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
