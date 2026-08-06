import { assertSame } from './harness/assert.js';
import { evaluateScript } from '../src/api.js';
import { createRealm } from '../src/runtime/realm.js';

/**
 * @param {string} source
 * @param {Parameters<typeof createRealm>[0]} [options]
 * @returns {unknown}
 */
function run(source, options) {
  return evaluateScript(createRealm(options), source).value;
}

/**
 * @param {string} source
 * @param {Parameters<typeof createRealm>[0]} [options]
 * @returns {{ timeValue: number }}
 */
function runDate(source, options) {
  const realm = createRealm(options);
  const completion = evaluateScript(realm, `var result = ${source};`);

  assertSame(completion.type, 'normal');

  const result = realm.globalObject.get('result');
  assertSame(
    typeof (/** @type {{ timeValue?: unknown }} */ (result).timeValue),
    'number',
  );
  return /** @type {{ timeValue: number }} */ (result);
}

export default [
  {
    name: 'Date is a realm-local constructor that creates Date-branded objects with clipped UTC milliseconds',
    run() {
      assertSame(run('typeof Date;'), 'function');
      assertSame(run('new Date(0) instanceof Date;'), true);
      assertSame(
        run('Object.prototype.toString.call(new Date(0));'),
        '[object Date]',
      );
      assertSame(runDate('new Date(123.9)').timeValue, 123);
      assertSame(
        Number.isNaN(runDate('new Date(8640000000000001)').timeValue),
        true,
      );
    },
  },
  {
    name: 'Date constructor converts Date arguments with Date String-default semantics, parses strings, and creates local calendar times',
    run() {
      const options = {
        dateHost: {
          now: () => 987654321,
          timezoneOffset: () => -120,
        },
      };

      assertSame(runDate('new Date(new Date(0))', options).timeValue, 0);
      assertSame(
        run(
          '(function () { var source = new Date(0); source.toString = function () { return "1970-01-01T00:00:00.001Z"; }; source.valueOf = function () { return 2; }; return new Date(source).getTime(); }())',
          options,
        ),
        1,
      );
      assertSame(
        runDate('new Date("1970-01-01T00:00:00.000Z")', options).timeValue,
        0,
      );
      assertSame(
        runDate('new Date(1970, 0, 1, 0, 0, 0, 0)', options).timeValue,
        -7200000,
      );
      assertSame(
        runDate('new Date(99, 0, 1)', options).timeValue,
        915141600000,
      );
      assertSame(runDate('new Date()', options).timeValue, 987654321);
    },
  },
  {
    name: 'Date constructor preserves invalid component years',
    run() {
      assertSame(Number.isNaN(runDate('new Date(NaN, 0)').timeValue), true);
      assertSame(
        Number.isNaN(runDate('new Date(undefined, 0)').timeValue),
        true,
      );
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Date.UTC(NaN, 0);'))),
        true,
      );
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Date.UTC(undefined, 0);'))),
        true,
      );
    },
  },
  {
    name: 'Date.parse implements ISO UTC, offset, date-only, and invalid input behavior without host parsing',
    run() {
      assertSame(run('Date.parse("1970-01-01T00:00:00.000Z");'), 0);
      assertSame(run('Date.parse("1970-01-01T00:00:00+01:30");'), -5400000);
      assertSame(run('Date.parse("2000-02-29");'), 951782400000);
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Date.parse("2001-02-29");'))),
        true,
      );
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Date.parse("not a date");'))),
        true,
      );
    },
  },
  {
    name: 'Date.parse defaults incomplete date-only forms to UTC',
    run() {
      assertSame(run('Date.parse("1970");'), 0);
      assertSame(run('Date.parse("1970-02");'), 2678400000);
      assertSame(run('Date.parse("0000");'), -62167219200000);
    },
  },
  {
    name: 'Date.parse defaults unzoned date-times to UTC',
    run() {
      assertSame(
        run('Date.parse("1970-01-01T00:00");', {
          dateHost: {
            timezoneOffset: () => -120,
          },
        }),
        0,
      );
    },
  },
  {
    name: 'Date.parse round-trips emitted UTC and extended local display strings',
    run() {
      assertSame(run('Date.parse(new Date(0).toUTCString());'), 0);
      assertSame(
        run('Date.parse(new Date(951827696000).toUTCString());'),
        951827696000,
      );
      assertSame(
        run(
          '(function () { var values = [-62198755200000, 253402300800000]; return values.every(function (value) { var date = new Date(value); return Date.parse(date.toString()) === value; }); }())',
          {
            dateHost: {
              timezoneOffset: () => 0,
            },
          },
        ),
        true,
      );
    },
  },
  {
    name: 'Date.parse round-trips signed six-digit ISO years emitted by toISOString',
    run() {
      assertSame(
        run(
          '(function () { var negative = new Date(Date.UTC(-1, 0, 1)); var positive = new Date(Date.UTC(10000, 0, 1)); return Date.parse(negative.toISOString()) === negative.getTime() && Date.parse(positive.toISOString()) === positive.getTime(); }())',
        ),
        true,
      );
    },
  },
  {
    name: 'Date.parse rejects the prohibited negative-zero expanded year',
    run() {
      assertSame(
        Number.isNaN(
          /** @type {number} */ (run('Date.parse("-000000-03-31T00:45Z");')),
        ),
        true,
      );
    },
  },
  {
    name: 'Date.parse preserves actual years 0000-0099 in emitted display strings',
    run() {
      assertSame(
        run(
          '(function () { var d = new Date(0); d.setUTCFullYear(0); return Date.parse(d.toUTCString()); }())',
        ),
        -62167219200000,
      );
      assertSame(
        run(
          '(function () { var d = new Date(0); d.setFullYear(50); return Date.parse(d.toString()); }())',
          {
            dateHost: {
              timezoneOffset: () => 0,
            },
          },
        ),
        -60589296000000,
      );
    },
  },
  {
    name: 'Date.UTC applies ES5 defaults, two-digit years, normalization, and clipping',
    run() {
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Date.UTC(1970);'))),
        true,
      );
      assertSame(run('Date.UTC(1970, 0);'), 0);
      assertSame(run('Date.UTC(99, 0, 1);'), 915148800000);
      assertSame(run('Date.UTC(1970, 12, 1);'), 31536000000);
      assertSame(run('Date.UTC(1970, 0, 1, 0, 0, 0, 1.9);'), 1);
      assertSame(
        Number.isNaN(/** @type {number} */ (run('Date.UTC(275760, 8, 14);'))),
        true,
      );
    },
  },
  {
    name: 'Date.now and Date called as a function use the injected clock and timezone adapter',
    run() {
      const options = {
        dateHost: {
          now: () => 0,
          timezoneOffset: () => -120,
        },
      };

      assertSame(run('Date.now();', options), 0);
      assertSame(run('typeof Date();', options), 'string');
      assertSame(
        run('Date();', options),
        'Thu Jan 01 1970 02:00:00 GMT+0200 (Local)',
      );
    },
  },
  {
    name: 'Date constructor observes own Date conversion overrides',
    run() {
      assertSame(
        runDate(
          '(function () { var value = new Date(0); value.toString = function () { return "1970-01-01T00:00:00.001Z"; }; value.valueOf = function () { return 2; }; return new Date(value); }())',
        ).timeValue,
        1,
      );
    },
  },
  {
    name: 'Date constructor observes inherited Date conversion overrides',
    run() {
      assertSame(
        runDate(
          '(function () { Date.prototype.toString = function () { return "1970-01-01T00:00:00.001Z"; }; return new Date(new Date(0)); }())',
        ).timeValue,
        1,
      );
    },
  },
  {
    name: 'Date constructor uses ordinary objects Number-default conversion order',
    run() {
      assertSame(
        run(
          '(function () { var observed = ""; var source = { valueOf: function () { observed += "valueOf"; return 123; }, toString: function () { observed += "toString"; return "1970-01-01T00:00:00.000Z"; } }; var date = new Date(source); return observed + "," + date.getTime(); }())',
        ),
        'valueOf,123',
      );
    },
  },
  {
    name: 'Date host receives UTC milliseconds for Date call and ES5 local construction',
    run() {
      /** @type {number[]} */
      const observed = [];
      const options = {
        dateHost: {
          now: () => 7200000,
          standardTimezoneOffset: 300,
          timezoneOffset(/** @type {number} */ utcMilliseconds) {
            observed.push(utcMilliseconds);
            return utcMilliseconds === 18000000 ? 240 : 300;
          },
        },
      };

      assertSame(
        runDate('new Date(1970, 0, 1, 0, 0, 0, 0)', options).timeValue,
        14400000,
      );
      assertSame(
        run('Date();', options),
        'Wed Dec 31 1969 21:00:00 GMT-0500 (Local)',
      );
      assertSame(observed.join(','), '18000000,7200000');
    },
  },
  {
    name: 'Date host derives standard offsets from deterministic northern and southern probes',
    run() {
      const minute = 60 * 1000;
      const day = 24 * 60 * minute;
      const julyProbe = 181 * day;
      const northernLocalTime =
        (31 + 28 + 7) * day + 2 * 60 * minute + 30 * minute;
      const southernLocalTime =
        (31 + 28 + 31 + 30 + 31 + 30 + 31 + 31 + 30 + 3) * day +
        2 * 60 * minute +
        30 * minute;
      /**
       * @type {{
       *   source: string,
       *   localTime: number,
       *   expectedTime: number,
       *   expectedProbes: number[],
       *   timezoneOffset: (observed: number[]) => (utcMilliseconds: number) => number,
       * }[]}
       */
      const cases = [
        {
          source: 'new Date(1970, 2, 8, 2, 30)',
          localTime: northernLocalTime,
          expectedTime: northernLocalTime + 240 * minute,
          expectedProbes: [0, julyProbe, northernLocalTime + 300 * minute],
          timezoneOffset(observed) {
            return (utcMilliseconds) => {
              observed.push(utcMilliseconds);
              return utcMilliseconds >= northernLocalTime + 300 * minute
                ? 240
                : 300;
            };
          },
        },
        {
          source: 'new Date(1970, 9, 4, 2, 30)',
          localTime: southernLocalTime,
          expectedTime: southernLocalTime - 600 * minute,
          expectedProbes: [0, julyProbe, southernLocalTime - 600 * minute],
          timezoneOffset(observed) {
            return (utcMilliseconds) => {
              observed.push(utcMilliseconds);
              return utcMilliseconds < julyProbe ||
                utcMilliseconds >= southernLocalTime
                ? -660
                : -600;
            };
          },
        },
      ];

      for (const testCase of cases) {
        /** @type {number[]} */
        const observed = [];
        const options = {
          dateHost: {
            timezoneOffset: testCase.timezoneOffset(observed),
          },
        };

        assertSame(
          runDate(testCase.source, options).timeValue,
          testCase.expectedTime,
        );
        assertSame(observed.join(','), testCase.expectedProbes.join(','));
      }
    },
  },
  {
    name: 'Date host derives the standard offset from the target year for Pacific/Apia local round-trips',
    run() {
      const transition = 1428141600000;
      const options = {
        dateHost: {
          timezoneOffset(/** @type {number} */ utcMilliseconds) {
            if (utcMilliseconds < 1420070400000) {
              return 660;
            }

            return utcMilliseconds < transition ? -840 : -780;
          },
        },
      };

      assertSame(
        run(
          '(function () { var date = new Date(2015, 3, 4, 11, 39); return date.getTime() + "," + date.getFullYear() + "," + date.getMonth() + "," + date.getDate() + "," + date.getHours() + "," + date.getMinutes(); }())',
          options,
        ),
        '1428097140000,2015,3,4,11,39',
      );
    },
  },
  {
    name: 'Date.prototype is an invalid Date-branded object',
    run() {
      const realm = createRealm();
      const datePrototype = /** @type {{
        getClassName: () => string,
        timeValue: number,
      }} */ (realm.intrinsics.datePrototype);

      assertSame(datePrototype.getClassName(), 'Date');
      assertSame(Number.isNaN(datePrototype.timeValue), true);
      assertSame(
        run('Object.prototype.toString.call(Date.prototype);'),
        '[object Date]',
      );
    },
  },
  {
    name: 'Date accessors derive local and UTC calendar fields through the timezone adapter',
    run() {
      const options = {
        dateHost: {
          timezoneOffset: () => -90,
        },
      };

      assertSame(
        run(
          '(function () { var d = new Date(Date.UTC(2020, 1, 29, 23, 58, 57, 456)); return [d.getTime(), d.getFullYear(), d.getUTCFullYear(), d.getMonth(), d.getUTCMonth(), d.getDate(), d.getUTCDate(), d.getDay(), d.getUTCDay(), d.getHours(), d.getUTCHours(), d.getMinutes(), d.getUTCMinutes(), d.getSeconds(), d.getUTCSeconds(), d.getMilliseconds(), d.getUTCMilliseconds(), d.getTimezoneOffset(), d.getYear()].join(","); }())',
          options,
        ),
        '1583020737456,2020,2020,2,1,1,29,0,6,1,23,28,58,57,57,456,456,-90,120',
      );
    },
  },
  {
    name: 'Date accessors return NaN for invalid dates and reject incompatible receivers',
    run() {
      assertSame(
        run(
          '(function () { var d = new Date(NaN); var values = [d.getTime(), d.getFullYear(), d.getUTCFullYear(), d.getMonth(), d.getUTCMonth(), d.getDate(), d.getUTCDate(), d.getDay(), d.getUTCDay(), d.getHours(), d.getUTCHours(), d.getMinutes(), d.getUTCMinutes(), d.getSeconds(), d.getUTCSeconds(), d.getMilliseconds(), d.getUTCMilliseconds(), d.getTimezoneOffset(), d.getYear()]; try { Date.prototype.getTime.call({}); } catch (error) { return values.every(function (value) { return value !== value; }) + ":" + error.name; } }())',
        ),
        'true:TypeError',
      );
    },
  },
  {
    name: 'Date setters update every local and UTC field with defaults and overflow normalization',
    run() {
      const options = {
        dateHost: {
          timezoneOffset: () => -120,
        },
      };

      assertSame(
        run(
          '(function () { var d, values = []; d = new Date(0); values.push(d.setTime(1.9)); d = new Date(0); values.push(d.setMilliseconds(2)); d = new Date(0); values.push(d.setUTCMilliseconds(2)); d = new Date(0); values.push(d.setSeconds(3)); d = new Date(0); values.push(d.setUTCSeconds(4, 5)); d = new Date(0); values.push(d.setMinutes(6, 7, 8)); d = new Date(0); values.push(d.setUTCMinutes(8, 9, 10)); d = new Date(0); values.push(d.setHours(3, 4, 5, 6)); d = new Date(0); values.push(d.setUTCHours(3, 4, 5, 6)); d = new Date(0); values.push(d.setDate(2)); d = new Date(0); values.push(d.setUTCDate(2)); d = new Date(0); values.push(d.setMonth(1)); d = new Date(0); values.push(d.setUTCMonth(1)); d = new Date(0); values.push(d.setFullYear(1971)); d = new Date(0); values.push(d.setUTCFullYear(1971)); d = new Date(0); values.push(d.setYear(99)); d = new Date(Date.UTC(2020, 0, 31, 23, 59, 58, 900)); d.setUTCMonth(1); values.push([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()].join("/")); d = new Date(Date.UTC(2000, 5, 15, 12, 34, 56, 789)); d.setUTCMinutes(5); values.push([d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()].join("/")); return values.join(","); }())',
          options,
        ),
        '1,2,2,3000,4005,367008,489010,3845006,11045006,86400000,86400000,2678400000,2678400000,31536000000,31536000000,915148800000,2020/2/2/23/59/58/900,12/5/56/789',
      );
    },
  },
  {
    name: 'Date setters propagate invalid dates except setTime and full-year recovery paths',
    run() {
      const options = {
        dateHost: {
          timezoneOffset: () => -120,
        },
      };

      assertSame(
        run(
          '(function () { var methods = ["setMilliseconds", "setUTCMilliseconds", "setSeconds", "setUTCSeconds", "setMinutes", "setUTCMinutes", "setHours", "setUTCHours", "setDate", "setUTCDate", "setMonth", "setUTCMonth"]; var i, d, value, invalid = true; for (i = 0; i < methods.length; i += 1) { d = new Date(NaN); value = d[methods[i]](1); invalid = invalid && value !== value && d.getTime() !== d.getTime(); } d = new Date(NaN); var time = d.setTime(5); d = new Date(NaN); var localYear = d.setFullYear(2000); d = new Date(NaN); var utcYear = d.setUTCFullYear(2000); try { Date.prototype.setDate.call({}, 1); } catch (error) { return invalid + ":" + time + ":" + localYear + ":" + utcYear + ":" + error.name; } }())',
          options,
        ),
        'true:5:946677600000:946684800000:TypeError',
      );
    },
  },
  {
    name: 'Date local full-year recovery defaults invalid dates from UTC zero before local conversion',
    run() {
      const options = {
        dateHost: {
          standardTimezoneOffset: 120,
          timezoneOffset: () => 120,
        },
      };

      assertSame(
        run('(new Date(NaN)).setFullYear(2000);', options),
        946692000000,
      );
    },
  },
  {
    name: 'Date setYear recovers invalid dates and applies its two-digit window after integer conversion',
    run() {
      const westernOptions = {
        dateHost: {
          standardTimezoneOffset: 120,
          timezoneOffset: () => 120,
        },
      };
      const utcOptions = {
        dateHost: {
          timezoneOffset: () => 0,
        },
      };

      assertSame(
        run('(new Date(NaN)).setYear(2000);', westernOptions),
        946692000000,
      );
      assertSame(
        run(
          '(function () { var d = new Date(0); var first = d.setYear(99.5); d = new Date(0); return first + ":" + d.setYear(-0.5); }())',
          utcOptions,
        ),
        '915148800000:-2208988800000',
      );
    },
  },
  {
    name: 'Date setYear propagates NaN, explicit undefined, and non-numeric input',
    run() {
      assertSame(
        run(
          '(function () { var d = new Date(0); var first = d.setYear(NaN); var firstTime = d.getTime(); d = new Date(0); var second = d.setYear(undefined); var secondTime = d.getTime(); d = new Date(0); var third = d.setYear("abc"); var thirdTime = d.getTime(); return [(first !== first) && (firstTime !== firstTime), (second !== second) && (secondTime !== secondTime), (third !== third) && (thirdTime !== thirdTime)].join(":"); }())',
        ),
        'true:true:true',
      );
    },
  },
  {
    name: 'Date setters convert supplied undefined optional fields and clip overflow',
    run() {
      assertSame(
        run(
          '(function () { var d = new Date(0); var optional = d.setUTCSeconds(1, undefined); d = new Date(0); var overflow = d.setUTCFullYear(275760, 8, 14); return (optional !== optional) + ":" + (overflow !== overflow); }())',
        ),
        'true:true',
      );
    },
  },
  {
    name: 'Date setters coerce supplied fields left-to-right and preserve omitted fields',
    run() {
      assertSame(
        run(
          '(function () { var log = ""; var d = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0)); var first = { valueOf: function () { log += "a"; return 3; } }; var second = { valueOf: function () { log += "b"; return 4; } }; d.setUTCHours(first, second); return log + ":" + d.getUTCHours() + ":" + d.getUTCMinutes() + ":" + d.getUTCSeconds() + ":" + d.getUTCMilliseconds(); }())',
        ),
        'ab:3:4:0:0',
      );
    },
  },
  {
    name: 'Date local setters invalidate their value when adapter conversion is non-finite',
    run() {
      const options = {
        dateHost: {
          standardTimezoneOffset: 0,
          timezoneOffset: () => NaN,
        },
      };

      assertSame(
        run(
          '(function () { var methods = ["setMilliseconds", "setSeconds", "setMinutes", "setHours", "setDate", "setMonth", "setFullYear", "setYear"]; var allInvalid = true; var d, result, index; for (index = 0; index < methods.length; index += 1) { d = new Date(0); result = d[methods[index]](1); allInvalid = allInvalid && result !== result && d.getTime() !== d.getTime(); } return allInvalid; }())',
          options,
        ),
        true,
      );
    },
  },
  {
    name: 'Date local conversion preserves clipped boundary instants after out-of-range DST probes',
    run() {
      const cases = [
        {
          source: 'new Date(275760, 8, 13).getTime();',
          time: 8640000000000000,
          standardTimezoneOffset: 60,
          probe: 8640000003600000,
        },
        {
          source: 'new Date(-271821, 3, 20).getTime();',
          time: -8640000000000000,
          standardTimezoneOffset: -60,
          probe: -8640000003600000,
        },
      ];

      for (const testCase of cases) {
        /** @type {number[]} */
        const observed = [];
        const options = {
          dateHost: {
            standardTimezoneOffset: testCase.standardTimezoneOffset,
            timezoneOffset(/** @type {number} */ utcMilliseconds) {
              observed.push(utcMilliseconds);
              return utcMilliseconds === testCase.probe ? 0 : NaN;
            },
          },
        };

        assertSame(run(testCase.source, options), testCase.time);
        assertSame(observed.join(','), String(testCase.probe));
      }
    },
  },
  {
    name: 'Date local setters use the adapter’s DST transition mapping',
    run() {
      const minute = 60 * 1000;
      const day = 24 * 60 * minute;
      const springLocalTime =
        (31 + 28 + 7) * day + 2 * 60 * minute + 30 * minute;
      /** @type {number[]} */
      const observed = [];
      const options = {
        dateHost: {
          standardTimezoneOffset: 300,
          timezoneOffset(/** @type {number} */ utcMilliseconds) {
            observed.push(utcMilliseconds);
            return utcMilliseconds >= springLocalTime + 300 * minute
              ? 240
              : 300;
          },
        },
      };

      assertSame(
        run('new Date(1970, 2, 8, 1, 30).setHours(2, 30);', options),
        springLocalTime + 240 * minute,
      );
      assertSame(
        observed.join(','),
        `${springLocalTime + 240 * minute},${springLocalTime + 240 * minute},${springLocalTime + 300 * minute}`,
      );
    },
  },
  {
    name: 'Date local setters select the standard-time occurrence of a repeated DST fall-back hour',
    run() {
      const minute = 60 * 1000;
      const day = 24 * 60 * minute;
      const fallLocalTime = 304 * day + 60 * minute + 30 * minute;
      const options = {
        dateHost: {
          standardTimezoneOffset: 300,
          timezoneOffset(/** @type {number} */ utcMilliseconds) {
            return utcMilliseconds >= fallLocalTime + 300 * minute ? 300 : 240;
          },
        },
      };

      assertSame(
        run('new Date(1970, 10, 1, 0, 30).setHours(1, 30);', options),
        fallLocalTime + 300 * minute,
      );
    },
  },
  {
    name: 'Date formatting methods render deterministic local and UTC strings',
    run() {
      const options = {
        dateHost: {
          now: () => 0,
          timezoneOffset: () => -90,
        },
      };

      assertSame(
        run(
          '(function () { var d = new Date(0); return [d.toString(), d.toDateString(), d.toTimeString(), d.toLocaleString(), d.toLocaleDateString(), d.toLocaleTimeString(), d.toUTCString(), d.valueOf(), Date()].join("|"); }())',
          options,
        ),
        'Thu Jan 01 1970 01:30:00 GMT+0130 (Local)|Thu Jan 01 1970|01:30:00 GMT+0130 (Local)|Thu Jan 01 1970 01:30:00 GMT+0130 (Local)|Thu Jan 01 1970|01:30:00 GMT+0130 (Local)|Thu, 01 Jan 1970 00:00:00 GMT|0|Thu Jan 01 1970 01:30:00 GMT+0130 (Local)',
      );
      assertSame(
        run('new Date(0).toString() + "|" + new Date(0).toGMTString();', {
          dateHost: {
            timezoneOffset: () => 300,
          },
        }),
        'Wed Dec 31 1969 19:00:00 GMT-0500 (Local)|Thu, 01 Jan 1970 00:00:00 GMT',
      );
    },
  },
  {
    name: 'Date formatting truncates fractional adapter offsets to minute fields that parse back',
    run() {
      const options = {
        dateHost: {
          standardTimezoneOffset: 0,
          timezoneOffset: () => -90.5,
        },
      };

      assertSame(
        run(
          '(function () { var date = new Date(0); return date.toString() + "|" + Date.parse(date.toString()); }())',
          options,
        ),
        'Thu Jan 01 1970 01:30:00 GMT+0130 (Local)|0',
      );
    },
  },
  {
    name: 'Date formatters handle invalid values, ISO extended years, and UTC aliases',
    run() {
      assertSame(
        run(
          '(function () { var invalid = new Date(NaN); var error; try { invalid.toISOString(); } catch (caught) { error = caught.name; } return [invalid.toString(), invalid.toDateString(), invalid.toTimeString(), invalid.toLocaleString(), invalid.toLocaleDateString(), invalid.toLocaleTimeString(), invalid.toUTCString(), error, new Date(1).toISOString(), new Date(Date.UTC(-1, 0, 1)).toISOString(), new Date(Date.UTC(10000, 0, 1)).toISOString(), Date.prototype.toGMTString === Date.prototype.toUTCString, Object.getOwnPropertyDescriptor(Date.prototype, "toUTCString").writable, Object.getOwnPropertyDescriptor(Date.prototype, "toUTCString").enumerable, Object.getOwnPropertyDescriptor(Date.prototype, "toUTCString").configurable].join("|"); }())',
        ),
        'Invalid Date|Invalid Date|Invalid Date|Invalid Date|Invalid Date|Invalid Date|Invalid Date|RangeError|1970-01-01T00:00:00.001Z|-000001-01-01T00:00:00.000Z|+010000-01-01T00:00:00.000Z|true|true|false|true',
      );
      assertSame(
        run(
          '(function () { try { Date.prototype.toString.call({}); } catch (error) { return error.name; } }())',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Date toJSON is generic and checks its numeric primitive before toISOString',
    run() {
      assertSame(
        run(
          '(function () { var log = ""; var invalid = { valueOf: function () { log += "n"; return NaN; }, toISOString: function () { log += "x"; return "wrong"; } }; var valid = { valueOf: function () { log += "v"; return 1; }, toISOString: function () { log += "i"; return "custom"; } }; return [Date.prototype.toJSON.call(new Date(NaN)), Date.prototype.toJSON.call(invalid), Date.prototype.toJSON.call(valid), log].join("|"); }())',
        ),
        '||custom|nvi',
      );
      assertSame(
        run(
          '(function () { try { Date.prototype.toJSON.call(1); } catch (error) { return error.name; } }())',
        ),
        'TypeError',
      );
    },
  },
];
