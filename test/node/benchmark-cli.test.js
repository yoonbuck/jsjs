import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import { resolveBenchmarkConfig } from '../../benchmark/config.js';
import { runNodeBenchmark } from '../../benchmark/run-node.js';
import { parseBenchmarkArguments, main } from '../../benchmark/cli.js';
import { readCleanSourceState } from '../../benchmark/source-state.js';
import {
  writeHostReport,
  writeHostReportsAtomically,
} from '../../benchmark/output.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const OUTPUT_DIRECTORY = '.benchmark-results/test-node-cli';
const SOURCE = Object.freeze({
  gitCommit: '0123456789abcdef0123456789abcdef01234567',
  gitDirty: false,
});

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
    name: 'benchmark CLI writes failures to stderr without polluting stdout',
    run() {
      const result = spawnSync(
        process.argv[0],
        ['benchmark/cli.js', 'not-a-command'],
        {
          cwd: REPOSITORY_ROOT_URL.pathname,
          encoding: 'utf8',
        },
      );

      assertSame(result.status, 1);
      assertSame(result.stdout, '');
      assertSame(result.stderr.includes('Unknown benchmark command'), true);
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
    name: 'benchmark output atomically replaces stale host reports and cleans staging files',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        warmups: 1,
        samples: 1,
        maxBatchSize: 1,
        workloads: ['arrays'],
      });
      const report = await runNodeBenchmark(config, {
        generatedAt: '2026-08-07T00:00:00.000Z',
        runId: 'atomic-fixture',
        source: SOURCE,
      });
      const outputDirectory = `${OUTPUT_DIRECTORY}-atomic`;
      const outputUrl = new URL(`${outputDirectory}/`, REPOSITORY_ROOT_URL);

      await rm(outputUrl, { recursive: true, force: true });
      await mkdir(outputUrl, { recursive: true });
      await writeFile(
        new URL('stale-host.json', outputUrl),
        '{"runId":"stale"}\n',
        'utf8',
      );
      await writeHostReportsAtomically(outputDirectory, [report]);

      const fileNames = (await readdir(outputUrl)).sort();
      assertSame(fileNames.join(','), 'node.json');
      assertSame(
        JSON.parse(await readFile(new URL('node.json', outputUrl), 'utf8'))
          .runId,
        'atomic-fixture',
      );

      await rm(outputUrl, { recursive: true, force: true });
    },
  },
  {
    name: 'benchmark output writes validated reports atomically and never leaves invalid final files',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        workloads: ['arrays'],
      });
      const report = await runNodeBenchmark(config, { source: SOURCE });
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
      /**
       * @param {string} outputDirectory
       * @param {readonly { host: string }[]} reports
       */
      const writeReports = async (outputDirectory, reports) => {
        calls.push(
          `write:${outputDirectory}:${reports.map((report) => report.host).join(',')}`,
        );
        return [];
      };

      await main(['run', '--host=all', `--output=${OUTPUT_DIRECTORY}`], {
        createRunMetadata() {
          return {
            generatedAt: '2026-08-07T00:00:00.000Z',
            runId: 'all-host-fixture',
          };
        },
        readSourceState() {
          return SOURCE;
        },
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
        writeReports,
      });

      assertSame(
        JSON.stringify(calls),
        JSON.stringify([
          'config:{}',
          'start:node',
          'end:node',
          'start:chromium',
          'end:chromium',
          'start:jsc',
          'end:jsc',
          `write:${OUTPUT_DIRECTORY}:node,chromium,jsc`,
        ]),
      );
      assertSame(peakHosts, 1);

      /**
       * @param {'node' | 'chromium' | 'jsc'} host
       * @returns {(config: unknown, metadata: { generatedAt: string, runId: string }) => Promise<{ host: 'node' | 'chromium' | 'jsc', generatedAt: string, runId: string }>}
       */
      function createRunner(host) {
        return async (_config, metadata) => {
          calls.push(`start:${host}`);
          activeHosts += 1;
          peakHosts = Math.max(peakHosts, activeHosts);
          await Promise.resolve();
          calls.push(`end:${host}`);
          activeHosts -= 1;
          assertSame(metadata.generatedAt, '2026-08-07T00:00:00.000Z');
          assertSame(metadata.runId, 'all-host-fixture');
          return { host, ...metadata };
        };
      }
    },
  },
  {
    name: 'benchmark CLI reads clean source state once and forwards it to every host',
    async run() {
      /** @type {Readonly<{ gitCommit: string, gitDirty: false }>} */
      const source = Object.freeze({
        gitCommit: '0123456789abcdef0123456789abcdef01234567',
        gitDirty: false,
      });
      let sourceReads = 0;
      /** @type {string[]} */
      const hosts = [];

      await main(['run', '--host=all', `--output=${OUTPUT_DIRECTORY}`], {
        createRunMetadata() {
          return {
            generatedAt: '2026-08-07T00:00:00.000Z',
            runId: 'source-fixture',
          };
        },
        readSourceState() {
          sourceReads += 1;
          return source;
        },
        resolveConfig() {
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
        async writeReports() {
          return [];
        },
      });

      assertSame(sourceReads, 1);
      assertSame(hosts.join(','), 'node,chromium,jsc');

      /**
       * @param {'node' | 'chromium' | 'jsc'} host
       * @returns {(config: unknown, metadata: { generatedAt: string, runId: string, source: Readonly<{ gitCommit: string, gitDirty: false }> }) => Promise<{ host: 'node' | 'chromium' | 'jsc' }>}
       */
      function createRunner(host) {
        return async (_config, metadata) => {
          assertSame(metadata.source, source);
          hosts.push(host);
          return { host };
        };
      }
    },
  },
  {
    name: 'source state accepts only a clean tree with a concrete revision',
    run() {
      /** @type {string[]} */
      const commands = [];
      const source = readCleanSourceState({
        runCommand(args) {
          commands.push(args.join(' '));
          return args[0] === 'rev-parse'
            ? '0123456789abcdef0123456789abcdef01234567\n'
            : '';
        },
      });

      assertSame(source.gitCommit, '0123456789abcdef0123456789abcdef01234567');
      assertSame(source.gitDirty, false);
      assertSame(Object.isFrozen(source), true);
      assertSame(
        commands.join(','),
        'rev-parse HEAD,status --porcelain --untracked-files=normal',
      );
      assertSame(
        assertThrows(
          () =>
            readCleanSourceState({
              runCommand(args) {
                return args[0] === 'rev-parse'
                  ? '0123456789abcdef0123456789abcdef01234567\n'
                  : ' M benchmark/cli.js\n';
              },
            }),
          Error,
        ).message,
        'Refusing to run against a dirty working tree',
      );
      assertSame(
        assertThrows(
          () =>
            readCleanSourceState({
              runCommand() {
                return '';
              },
            }),
          Error,
        ).message.includes('git revision'),
        true,
      );
    },
  },
  {
    name: 'benchmark CLI rejects a dirty tree before running hosts or writing reports',
    async run() {
      let hostRan = false;
      let reportsWritten = false;
      let error;

      try {
        await main(['run', '--host=node', `--output=${OUTPUT_DIRECTORY}`], {
          readSourceState() {
            throw new Error('Refusing to run against a dirty working tree');
          },
          resolveConfig() {
            return resolveBenchmarkConfig({
              profile: 'smoke',
              workloads: ['arrays'],
            });
          },
          runners: {
            async node() {
              hostRan = true;
              return { host: 'node' };
            },
            async chromium() {
              throw new Error('unexpected chromium runner');
            },
            async jsc() {
              throw new Error('unexpected jsc runner');
            },
          },
          async writeReports() {
            reportsWritten = true;
            return [];
          },
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(error instanceof Error, true);
      assertSame(hostRan, false);
      assertSame(reportsWritten, false);
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
