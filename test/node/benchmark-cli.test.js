import { readFile, rm } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import { resolveBenchmarkConfig } from '../../benchmark/config.js';
import { runNodeBenchmark } from '../../benchmark/run-node.js';
import { parseBenchmarkArguments, main } from '../../benchmark/cli.js';
import { writeHostReport } from '../../benchmark/output.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const OUTPUT_DIRECTORY = '.benchmark-results/test-node-cli';

const tests = [
  {
    name: 'benchmark CLI parses run arguments exactly',
    run() {
      assertSame(
        JSON.stringify(
          parseBenchmarkArguments([
            'run',
            '--host=node',
            '--profile=smoke',
            '--output=.benchmark-results/test',
            '--workload=arrays',
          ]),
        ),
        JSON.stringify({
          command: 'run',
          hosts: ['node'],
          outputDirectory: '.benchmark-results/test',
          config: {
            profile: 'smoke',
            workloads: ['arrays'],
          },
        }),
      );
    },
  },
  {
    name: 'benchmark CLI rejects unknown options duplicate hosts missing values and unsafe output paths',
    run() {
      assertSame(
        assertThrows(
          () => parseBenchmarkArguments(['run', '--host=node', '--wat']),
          Error,
        ).message,
        'Unknown option: --wat',
      );
      assertSame(
        assertThrows(
          () => parseBenchmarkArguments(['run', '--host=node', '--host=node']),
          RangeError,
        ).message,
        'Duplicate benchmark host: node',
      );
      assertSame(
        assertThrows(() => parseBenchmarkArguments(['run', '--host']), Error)
          .message,
        'Missing value for --host',
      );
      assertSame(
        assertThrows(
          () =>
            parseBenchmarkArguments([
              'run',
              '--host=node',
              `--output=${new URL('.', REPOSITORY_ROOT_URL).pathname}`,
            ]),
          RangeError,
        ).message.includes('absolute'),
        true,
      );
      assertSame(
        assertThrows(
          () =>
            parseBenchmarkArguments(['run', '--host=node', '--output=../x']),
          RangeError,
        ).message.includes('outside repository'),
        true,
      );
    },
  },
  {
    name: 'benchmark output writes validated reports atomically and never leaves invalid final files',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        workloads: ['arrays'],
      });
      const report = await runNodeBenchmark(config);
      const invalidReport = {
        ...report,
        results: [
          {
            ...report.results[0],
            checksum: report.results[0].checksum + 1,
          },
          ...report.results.slice(1),
        ],
      };
      const outputUrl = new URL(`${OUTPUT_DIRECTORY}/`, REPOSITORY_ROOT_URL);
      const invalidOutputDirectory = `${OUTPUT_DIRECTORY}-invalid`;
      const invalidOutputUrl = new URL(
        `${invalidOutputDirectory}/`,
        REPOSITORY_ROOT_URL,
      );
      const finalReportUrl = new URL('node.json', outputUrl);
      const invalidFinalReportUrl = new URL('node.json', invalidOutputUrl);

      await rm(outputUrl, { recursive: true, force: true });
      await rm(invalidOutputUrl, { recursive: true, force: true });
      await writeHostReport(OUTPUT_DIRECTORY, report);

      const persisted = JSON.parse(await readFile(finalReportUrl, 'utf8'));

      assertSame(persisted.host, 'node');
      assertSame(persisted.results.length, 2);
      let invalidError;

      try {
        await writeHostReport(invalidOutputDirectory, invalidReport);
      } catch (error) {
        invalidError = error;
      }

      assertSame(invalidError instanceof Error, true);
      assertSame(await fileExists(invalidFinalReportUrl), false);
      assertSame(
        JSON.stringify(JSON.parse(await readFile(finalReportUrl, 'utf8'))),
        JSON.stringify(persisted),
      );

      await rm(outputUrl, { recursive: true, force: true });
      await rm(invalidOutputUrl, { recursive: true, force: true });
    },
  },
  {
    name: 'benchmark CLI runs all hosts sequentially before writing each validated report',
    async run() {
      /** @type {string[]} */
      const calls = [];
      let activeHosts = 0;
      let peakHosts = 0;
      /** @type {typeof writeHostReport} */
      const writeReport = async (outputDirectory, report) => {
        calls.push(`write:${outputDirectory}:${report.host}`);
        return new URL('write-report.json', REPOSITORY_ROOT_URL);
      };

      await main(['run', '--host=all', `--output=${OUTPUT_DIRECTORY}`], {
        resolveConfig(options) {
          calls.push(`config:${JSON.stringify(options)}`);
          return resolveBenchmarkConfig({
            profile: 'smoke',
            workloads: ['arrays'],
          });
        },
        runners: {
          node: createRunner('node'),
          chromium: createRunner('chromium'),
          jsc: createRunner('jsc'),
        },
        writeReport,
      });

      assertSame(
        JSON.stringify(calls),
        JSON.stringify([
          'config:{}',
          'start:node',
          'end:node',
          `write:${OUTPUT_DIRECTORY}:node`,
          'start:chromium',
          'end:chromium',
          `write:${OUTPUT_DIRECTORY}:chromium`,
          'start:jsc',
          'end:jsc',
          `write:${OUTPUT_DIRECTORY}:jsc`,
        ]),
      );
      assertSame(peakHosts, 1);

      /**
       * @param {'node' | 'chromium' | 'jsc'} host
       * @returns {() => Promise<{ host: 'node' | 'chromium' | 'jsc' }>}
       */
      function createRunner(host) {
        return async () => {
          calls.push(`start:${host}`);
          activeHosts += 1;
          peakHosts = Math.max(peakHosts, activeHosts);
          await Promise.resolve();
          calls.push(`end:${host}`);
          activeHosts -= 1;
          return { host };
        };
      }
    },
  },
];

/**
 * @param {URL} fileUrl
 * @returns {Promise<boolean>}
 */
async function fileExists(fileUrl) {
  try {
    await readFile(fileUrl, 'utf8');
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false;
    }

    throw error;
  }
}

export default tests;
