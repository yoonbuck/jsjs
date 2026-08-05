import { assertSame, assertThrows } from './harness/assert.js';
import { runTests } from './harness/runner.js';

const tests = [
  {
    name: 'assertSame uses same-value semantics',
    run() {
      assertSame(NaN, NaN);
      assertThrows(() => assertSame(0, -0), Error);
      assertThrows(() => assertSame(new Date(0), new Date(0)), Error);
      assertThrows(() => assertSame(/ab/i, /ab/), Error);
      assertThrows(
        () => assertSame(new Map([['a', 1]]), new Map([['a', 1]])),
        Error,
      );
      assertThrows(() => assertSame(new Set([1]), new Set([1])), Error);
    },
  },
  {
    name: 'foundation harness reports deterministic json',
    async run() {
      const nestedTests = [
        {
          name: 'passing assertion',
          run() {
            assertSame('ready', 'ready');
          },
        },
        {
          name: 'captured failure',
          run() {
            assertSame(1, 2);
          },
        },
      ];

      /** @type {{ name: string, status: 'passed' | 'failed', error?: { name: string, message: string } }[]} */
      const results = [];

      await runTests(nestedTests, (result) => {
        results.push(result);
      });

      assertSame(
        JSON.stringify(results),
        JSON.stringify([
          { name: 'passing assertion', status: 'passed' },
          {
            name: 'captured failure',
            status: 'failed',
            error: {
              name: 'Error',
              message: 'Expected 1 to be the same value as 2',
            },
          },
        ]),
      );
    },
  },
];

export default tests;
