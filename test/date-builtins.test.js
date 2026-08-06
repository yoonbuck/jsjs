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
  assertSame(typeof /** @type {{ timeValue?: unknown }} */ (result).timeValue, 'number');
  return /** @type {{ timeValue: number }} */ (result);
}

export default [
  {
    name: 'Date is a realm-local constructor that creates Date-branded objects with clipped UTC milliseconds',
    run() {
      assertSame(run('typeof Date;'), 'function');
      assertSame(run('new Date(0) instanceof Date;'), true);
      assertSame(run('Object.prototype.toString.call(new Date(0));'), '[object Date]');
      assertSame(runDate('new Date(123.9)').timeValue, 123);
      assertSame(Number.isNaN(runDate('new Date(8640000000000001)').timeValue), true);
    },
  },
  {
    name: 'Date constructor clones dates, parses strings, and creates local calendar times',
    run() {
      const options = {
        dateHost: {
          now: () => 987654321,
          timezoneOffset: () => -120,
        },
      };

      assertSame(runDate('new Date(new Date(123))', options).timeValue, 123);
      assertSame(runDate('new Date("1970-01-01T00:00:00.000Z")', options).timeValue, 0);
      assertSame(runDate('new Date(1970, 0, 1, 0, 0, 0, 0)', options).timeValue, -7200000);
      assertSame(runDate('new Date(99, 0, 1)', options).timeValue, 915141600000);
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
        Number.isNaN(
          /** @type {number} */ (run('Date.UTC(undefined, 0);')),
        ),
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
      assertSame(Number.isNaN(/** @type {number} */ (run('Date.parse("2001-02-29");'))), true);
      assertSame(Number.isNaN(/** @type {number} */ (run('Date.parse("not a date");'))), true);
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
    name: 'Date.UTC applies ES5 defaults, two-digit years, normalization, and clipping',
    run() {
      assertSame(Number.isNaN(/** @type {number} */ (run('Date.UTC(1970);'))), true);
      assertSame(run('Date.UTC(1970, 0);'), 0);
      assertSame(run('Date.UTC(99, 0, 1);'), 915148800000);
      assertSame(run('Date.UTC(1970, 12, 1);'), 31536000000);
      assertSame(run('Date.UTC(1970, 0, 1, 0, 0, 0, 1.9);'), 1);
      assertSame(Number.isNaN(/** @type {number} */ (run('Date.UTC(275760, 8, 14);'))), true);
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
      assertSame(run('Date();', options), 'Thu Jan 01 1970 02:00:00 GMT+0200 (UTC)');
    },
  },
  {
    name: 'Date constructor applies String-hint conversion to Date objects',
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
          '(function () { Object.prototype.toString = function () { return "1970-01-01T00:00:00.001Z"; }; return new Date(new Date(0)); }())',
        ).timeValue,
        1,
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
        'Wed Dec 31 1969 21:00:00 GMT-0500 (UTC)',
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
      const northernLocalTime = (31 + 28 + 7) * day + 2 * 60 * minute + 30 * minute;
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

        assertSame(runDate(testCase.source, options).timeValue, testCase.expectedTime);
        assertSame(observed.join(','), testCase.expectedProbes.join(','));
      }
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
];
