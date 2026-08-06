import { assertSame } from './harness/assert.js';
import {
  MS_PER_DAY,
  dateFromTime,
  day,
  dayFromYear,
  dayWithinYear,
  daysInYear,
  hourFromTime,
  inLeapYear,
  makeDate,
  makeDay,
  makeTime,
  minFromTime,
  monthFromTime,
  msFromTime,
  secFromTime,
  timeFromYear,
  timeClip,
  timeWithinDay,
  weekDay,
  yearFromTime,
} from '../src/runtime/date.js';

const DAYS_FROM_1970_TO_2000 = 30 * 365 + 7;
const FEBRUARY_29_2000 = (DAYS_FROM_1970_TO_2000 + 31 + 28) * MS_PER_DAY;

export default [
  {
    name: 'day and time helpers floor negative instants into the preceding day',
    run() {
      assertSame(day(0), 0);
      assertSame(day(MS_PER_DAY - 1), 0);
      assertSame(day(MS_PER_DAY), 1);
      assertSame(day(-1), -1);
      assertSame(day(-MS_PER_DAY), -1);
      assertSame(timeWithinDay(-1), MS_PER_DAY - 1);
      assertSame(Object.is(timeWithinDay(-MS_PER_DAY), 0), true);
      assertSame(hourFromTime(-1), 23);
      assertSame(minFromTime(-1), 59);
      assertSame(secFromTime(-1), 59);
      assertSame(msFromTime(-1), 999);
      assertSame(weekDay(0), 4);
      assertSame(weekDay(-MS_PER_DAY), 3);
    },
  },
  {
    name: 'calendar helpers follow Gregorian leap-year rules across epoch boundaries',
    run() {
      assertSame(daysInYear(1900), 365);
      assertSame(daysInYear(2000), 366);
      assertSame(dayFromYear(1970), 0);
      assertSame(dayFromYear(1971), 365);
      assertSame(dayFromYear(2000), DAYS_FROM_1970_TO_2000);
      assertSame(timeFromYear(2000), DAYS_FROM_1970_TO_2000 * MS_PER_DAY);
      assertSame(yearFromTime(-1), 1969);
      assertSame(yearFromTime(timeFromYear(2000)), 2000);
      assertSame(inLeapYear(-1), 0);
      assertSame(inLeapYear(FEBRUARY_29_2000), 1);
      assertSame(dayWithinYear(-1), 364);
      assertSame(dayWithinYear(FEBRUARY_29_2000), 59);
      assertSame(monthFromTime(-1), 11);
      assertSame(monthFromTime(FEBRUARY_29_2000), 1);
      assertSame(dateFromTime(-1), 31);
      assertSame(dateFromTime(FEBRUARY_29_2000), 29);
    },
  },
  {
    name: 'make helpers truncate fields and normalize month overflow before clipping',
    run() {
      assertSame(makeTime(1.9, 2.9, 3.9, 4.9), 3723004);
      assertSame(Number.isNaN(makeTime(Infinity, 0, 0, 0)), true);
      assertSame(makeDay(1970, 0, 1), 0);
      assertSame(makeDay(1970, 12, 1), 365);
      assertSame(makeDay(1970, -1, 1), -31);
      assertSame(makeDay(2000, 1, 29.9), DAYS_FROM_1970_TO_2000 + 31 + 28);
      assertSame(Number.isNaN(makeDay(1970, 0, NaN)), true);
      assertSame(makeDate(1, 3723004), MS_PER_DAY + 3723004);
      assertSame(Number.isNaN(makeDate(0, Infinity)), true);
    },
  },
  {
    name: 'timeClip enforces the ES5 range limit and truncates toward zero',
    run() {
      assertSame(timeClip(8640000000000000), 8640000000000000);
      assertSame(timeClip(-8640000000000000), -8640000000000000);
      assertSame(Number.isNaN(timeClip(8640000000000001)), true);
      assertSame(Number.isNaN(timeClip(-8640000000000001)), true);
      assertSame(timeClip(123.987), 123);
      assertSame(Object.is(timeClip(-0.9), -0), true);
      assertSame(Number.isNaN(timeClip(Infinity)), true);
    },
  },
];
