import { assertSame, assertThrows } from './harness/assert.js';
import { runTests } from './harness/runner.js';

const tests = [
  {
    name: 'assert helpers work',
    run() {
      assertSame({ ok: true }, { ok: true });
      assertThrows(() => assertSame(1, 2), Error);
    },
  },
  {
    name: 'foundation harness reports deterministic json',
    async run() {
      const nestedTests = [
        {
          name: 'passing assertion',
          run() {
            assertSame({ ok: true }, { ok: true });
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
              message: 'Expected 1 to deeply equal 2',
            },
          },
        ]),
      );
    },
  },
];

export default tests;
