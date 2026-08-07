import { assertSame, assertThrows } from './harness/assert.js';
import { PROFILES, resolveBenchmarkConfig } from '../benchmark/config.js';
import { calibrateBatchSize } from '../benchmark/calibration.js';
import {
  coefficientOfVariation,
  geometricMean,
  median,
  percentile95,
  summarizeSamples,
} from '../benchmark/statistics.js';
import { WORKLOADS, workloadsForProfile } from '../benchmark/workloads.js';

const tests = [
  {
    name: 'benchmark workloads have committed checksums',
    run() {
      assertSame(
        WORKLOADS.map(({ name, expectedChecksum }) => `${name}:${expectedChecksum}`).join(','),
        [
          'arithmetic-loops:1397312734',
          'calls-recursion:-1100296460',
          'object-properties:1122746965',
          'arrays:778416596',
          'strings:677005',
          'json:18589934',
          'regexp:8900000',
        ].join(','),
      );
      assertSame(Object.isFrozen(WORKLOADS), true);
      assertSame(Object.isFrozen(WORKLOADS[0]), true);
    },
  },
  {
    name: 'smoke profile keeps every workload with reduced deterministic source',
    run() {
      const smoke = workloadsForProfile('smoke');
      assertSame(smoke.length, WORKLOADS.length);
      assertSame(smoke.every((entry) => entry.source.length > 0), true);
      assertSame(
        smoke.every((entry) => Number.isInteger(entry.expectedChecksum)),
        true,
      );
      assertSame(
        smoke.some((entry, index) => entry.source !== WORKLOADS[index].source),
        true,
      );
    },
  },
  {
    name: 'benchmark configuration rejects invalid sample settings',
    run() {
      assertSame(PROFILES.default.samples, 9);
      assertSame(PROFILES.smoke.samples, 3);
      assertThrows(() => resolveBenchmarkConfig({ samples: 0 }), RangeError);
      assertThrows(
        () => resolveBenchmarkConfig({ profile: 'missing' }),
        RangeError,
      );
    },
  },
  {
    name: 'benchmark statistics use defined median p95 CV and geomean semantics',
    run() {
      assertSame(median([4, 1, 3, 2]), 2.5);
      assertSame(percentile95([1, 2, 3, 4, 5]), 5);
      assertSame(coefficientOfVariation([2, 2, 2]), 0);
      assertSame(geometricMean([4, 16]), 8);
      assertThrows(() => median([]), RangeError);
      assertThrows(() => geometricMean([1, 0]), RangeError);
    },
  },
  {
    name: 'benchmark sample summaries freeze median p95 and CV values',
    run() {
      const summary = summarizeSamples([2, 2, 2]);
      assertSame(
        JSON.stringify(summary),
        JSON.stringify({
          median: 2,
          p95: 2,
          coefficientOfVariation: 0,
        }),
      );
      assertSame(Object.isFrozen(summary), true);
    },
  },
  {
    name: 'calibration grows toward the target without exceeding its bound',
    run() {
      const calls = [];
      const result = calibrateBatchSize(
        (count) => {
          calls.push(count);
          return { elapsedMs: count * 2, checksum: 17 };
        },
        {
          expectedChecksum: 17,
          targetSampleMs: 10,
          maxBatchSize: 4,
          context: 'steady native fixture',
        },
      );
      assertSame(result.batchSize, 4);
      assertSame(calls.join(','), '1,4');
    },
  },
  {
    name: 'calibration identifies checksum failures with context',
    run() {
      const error = assertThrows(
        () =>
          calibrateBatchSize(
            () => ({ elapsedMs: 1, checksum: 9 }),
            {
              expectedChecksum: 17,
              targetSampleMs: 10,
              maxBatchSize: 4,
              context: 'cold jsjs arrays',
            },
          ),
        Error,
      );
      assertSame(error.message.includes('cold jsjs arrays'), true);
    },
  },
  {
    name: 'calibration rejects zero and non-finite elapsed times',
    run() {
      assertThrows(
        () =>
          calibrateBatchSize(
            () => ({ elapsedMs: 0, checksum: 17 }),
            {
              expectedChecksum: 17,
              targetSampleMs: 10,
              maxBatchSize: 4,
              context: 'zero fixture',
            },
          ),
        RangeError,
      );
      assertThrows(
        () =>
          calibrateBatchSize(
            () => ({ elapsedMs: Number.POSITIVE_INFINITY, checksum: 17 }),
            {
              expectedChecksum: 17,
              targetSampleMs: 10,
              maxBatchSize: 4,
              context: 'infinite fixture',
            },
          ),
        RangeError,
      );
    },
  },
];

export default tests;
