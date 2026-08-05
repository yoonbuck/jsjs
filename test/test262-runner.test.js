import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm, evaluateScript } from '../src/index.js';
import {
  Test262MetadataError,
  expandVariants,
  parseTest262Metadata,
  resolveIncludes,
} from '../tools/test262/metadata.js';
import {
  DEFAULT_INCLUDES,
  decideSkip,
  runTest262Suite,
  sortTestPaths,
} from '../tools/test262/runner.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatReport,
  formatRecordLine,
} from '../tools/test262/report.js';
import { createFixtureTest262Host } from './harness/test262-host.js';

/**
 * @typedef {import('../tools/test262/runner.js').Test262Host} Test262Host
 */

const engine = { createRealm, evaluateScript };

/**
 * Reads and parses the fixture manifest, failing loudly when a host cannot
 * enumerate it (the fixture hosts always can).
 *
 * @param {Test262Host} host
 * @returns {Promise<{ tests: string[], malformed: string[] }>}
 */
async function readFixtureManifest(host) {
  if (typeof host.readManifest !== 'function') {
    throw new Error('fixture host does not implement readManifest');
  }

  return JSON.parse(await host.readManifest());
}

const HARNESS = {
  'assert.js': [
    'function assert(condition, message) {',
    '  if (condition !== true) {',
    "    throw new Test262Error('assert failed: ' + message);",
    '  }',
    '}',
    'assert.sameValue = function (actual, expected, message) {',
    '  if (actual !== expected) {',
    "    throw new Test262Error('assert.sameValue failed: ' + message);",
    '  }',
    '};',
  ].join('\n'),
  'sta.js': [
    'function Test262Error(message) {',
    '  this.message = message;',
    '}',
    'Test262Error.thrower = function (message) {',
    '  throw new Test262Error(message);',
    '};',
    'function OtherError(message) {',
    '  this.message = message;',
    '}',
  ].join('\n'),
  'add.js': 'function add(left, right) { return left + right; }',
  'boom.js': "throw new Test262Error('include exploded');",
};

/**
 * @param {Record<string, string>} tests
 * @param {Record<string, string>} [includes]
 * @returns {Test262Host}
 */
function createMemoryHost(tests, includes = HARNESS) {
  return {
    readTest(file) {
      if (!Object.prototype.hasOwnProperty.call(tests, file)) {
        throw new Error(`No such fixture test: ${file}`);
      }

      return tests[file];
    },
    readInclude(name) {
      if (!Object.prototype.hasOwnProperty.call(includes, name)) {
        throw new Error(`No such fixture include: ${name}`);
      }

      return includes[name];
    },
  };
}

/**
 * @param {string} description
 * @param {string} body
 * @param {string} [extra]
 * @returns {string}
 */
function fixture(description, body, extra = '') {
  return `/*---\ndescription: ${description}\n${extra}---*/\n${body}\n`;
}

/**
 * @param {Record<string, string>} tests
 * @param {{ supportedFeatures?: readonly string[], skipFeatures?: readonly string[], paths?: readonly string[] }} [options]
 * @returns {Promise<{ records: readonly any[], summary: any }>}
 */
function runMemorySuite(tests, options = {}) {
  return runTest262Suite({
    engine,
    host: createMemoryHost(tests),
    paths: options.paths ?? Object.keys(tests),
    supportedFeatures: options.supportedFeatures ?? [],
    skipFeatures: options.skipFeatures ?? [],
  });
}

/**
 * @param {readonly any[]} records
 * @returns {string}
 */
function summarizeRecords(records) {
  return records
    .map(
      (record) =>
        `${record.file}|${String(record.variant)}|${record.status}|${record.reason ?? ''}`,
    )
    .join('\n');
}

const FIXTURE_REPORT = [
  '{"type":"test","file":"malformed/missing-frontmatter.js","variant":null,"status":"failed","reason":"metadata-error","message":"Missing Test262 frontmatter block"}',
  '{"type":"test","file":"malformed/negative-without-type.js","variant":null,"status":"failed","reason":"metadata-error","message":"negative requires both a phase and a type"}',
  '{"type":"test","file":"test/feature-skip.js","variant":null,"status":"skipped","reason":"unsupported-feature","message":"unsupported features: Proxy, Reflect","features":["Proxy","Reflect"]}',
  '{"type":"test","file":"test/includes.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/includes.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/no-strict.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/only-strict.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/parse-negative.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/parse-negative.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/positive.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/positive.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/raw.js","variant":"raw","status":"passed"}',
  '{"type":"test","file":"test/runtime-negative.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/runtime-negative.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/supported-feature.js","variant":"non-strict","status":"passed","features":["fixture-subset"]}',
  '{"type":"test","file":"test/supported-feature.js","variant":"strict","status":"passed","features":["fixture-subset"]}',
  '{"type":"summary","total":16,"passed":13,"failed":2,"skipped":1}',
  '',
].join('\n');

export default [
  {
    name: 'metadata parses the frontmatter subset',
    run: () => {
      const metadata = parseTest262Metadata(
        [
          '/*---',
          'description: Every supported key',
          'esid: sec-fixture',
          'es5id: 15.1.1_A1',
          'author: Test Author',
          'negative:',
          '  phase: parse',
          '  type: SyntaxError',
          'includes: [propertyHelper.js, compareArray.js]',
          'flags: [onlyStrict]',
          'features: [Proxy]',
          '---*/',
          'var unreachable;',
        ].join('\n'),
      );

      assertSame(metadata.description, 'Every supported key');
      assertSame(metadata.esid, 'sec-fixture');
      assertSame(metadata.es5id, '15.1.1_A1');
      assertSame(metadata.author, 'Test Author');
      assertSame(
        JSON.stringify(metadata.negative),
        '{"phase":"parse","type":"SyntaxError"}',
      );
      assertSame(
        JSON.stringify(metadata.includes),
        '["propertyHelper.js","compareArray.js"]',
      );
      assertSame(JSON.stringify(metadata.flags), '["onlyStrict"]');
      assertSame(JSON.stringify(metadata.features), '["Proxy"]');
    },
  },
  {
    name: 'metadata parses block sequences, literal blocks, and folded blocks',
    run: () => {
      const metadata = parseTest262Metadata(
        [
          '/*---',
          'description: >',
          '  folded description',
          '  across lines',
          'info: |',
          '  literal line one',
          '    indented line two',
          'includes:',
          '  - assert.js',
          '  - sta.js',
          'features:',
          '  - Symbol',
          '---*/',
        ].join('\n'),
      );

      assertSame(metadata.description, 'folded description across lines');
      assertSame(metadata.info, 'literal line one\n  indented line two');
      assertSame(JSON.stringify(metadata.includes), '["assert.js","sta.js"]');
      assertSame(JSON.stringify(metadata.features), '["Symbol"]');
    },
  },
  {
    name: 'metadata rejects a source without a frontmatter block',
    run: () => {
      const error = assertThrows(
        () => parseTest262Metadata('var noFrontmatter = 1;\n'),
        Test262MetadataError,
      );

      assertSame(error.message, 'Missing Test262 frontmatter block');
    },
  },
  {
    name: 'metadata rejects an unterminated frontmatter block',
    run: () => {
      const error = assertThrows(
        () => parseTest262Metadata('/*---\ndescription: never closed\n'),
        Test262MetadataError,
      );

      assertSame(error.message, 'Unterminated Test262 frontmatter block');
    },
  },
  {
    name: 'metadata rejects unknown keys, duplicate keys, and tab indentation',
    run: () => {
      assertThrows(
        () => parseTest262Metadata('/*---\ndescription: a\nbogus: b\n---*/\n'),
        Test262MetadataError,
      );
      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\ndescription: b\n---*/\n',
          ),
        Test262MetadataError,
      );
      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\nnegative:\n\tphase: parse\n\ttype: Test262Error\n---*/\n',
          ),
        Test262MetadataError,
      );
    },
  },
  {
    name: 'metadata rejects an empty or missing description',
    run: () => {
      assertThrows(
        () => parseTest262Metadata('/*---\nesid: sec-x\n---*/\n'),
        Test262MetadataError,
      );
      assertThrows(
        () => parseTest262Metadata('/*---\ndescription:\n---*/\n'),
        Test262MetadataError,
      );
    },
  },
  {
    name: 'metadata rejects unknown and conflicting flags',
    run: () => {
      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\nflags: [teleport]\n---*/\n',
          ),
        Test262MetadataError,
      );
      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\nflags: [onlyStrict, noStrict]\n---*/\n',
          ),
        Test262MetadataError,
      );
      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\nflags: [raw]\nincludes: [assert.js]\n---*/\n',
          ),
        Test262MetadataError,
      );
    },
  },
  {
    name: 'metadata rejects incomplete negative expectations',
    run: () => {
      const error = assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\nnegative:\n  phase: parse\n---*/\n',
          ),
        Test262MetadataError,
      );

      assertSame(error.message, 'negative requires both a phase and a type');

      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: a\nnegative:\n  phase: lunchtime\n  type: SyntaxError\n---*/\n',
          ),
        Test262MetadataError,
      );
    },
  },
  {
    name: 'variant expansion honours the strictness flags',
    run: () => {
      const variantsOf = (/** @type {string} */ flags) =>
        JSON.stringify(
          expandVariants(
            parseTest262Metadata(
              `/*---\ndescription: a\n${flags}---*/\nvar a;\n`,
            ),
          ),
        );

      assertSame(variantsOf(''), '["non-strict","strict"]');
      assertSame(variantsOf('flags: [onlyStrict]\n'), '["strict"]');
      assertSame(variantsOf('flags: [noStrict]\n'), '["non-strict"]');
      assertSame(variantsOf('flags: [raw]\n'), '["raw"]');
    },
  },
  {
    name: 'include resolution prepends default harness files and dedupes',
    run: () => {
      assertSame(JSON.stringify(DEFAULT_INCLUDES), '["assert.js","sta.js"]');

      const metadata = parseTest262Metadata(
        '/*---\ndescription: a\nincludes: [sta.js, add.js]\n---*/\nvar a;\n',
      );

      assertSame(
        JSON.stringify(resolveIncludes(metadata)),
        '["assert.js","sta.js","add.js"]',
      );

      const raw = parseTest262Metadata(
        '/*---\ndescription: a\nflags: [raw]\n---*/\nvar a;\n',
      );

      assertSame(JSON.stringify(resolveIncludes(raw)), '[]');
    },
  },
  {
    name: 'skip decisions cover unsupported flags, denied features, and allowed features',
    run: () => {
      const metadataOf = (/** @type {string} */ extra) =>
        parseTest262Metadata(`/*---\ndescription: a\n${extra}---*/\nvar a;\n`);
      const reasonOf = (
        /** @type {import('../tools/test262/runner.js').Test262Metadata} */ metadata,
        /** @type {import('../tools/test262/runner.js').Test262SkipOptions} */ options,
      ) => {
        const decision = decideSkip(metadata, options);
        return decision === null ? null : decision.reason;
      };

      assertSame(
        reasonOf(metadataOf('flags: [module]\n'), {}),
        'unsupported-flag',
      );
      assertSame(
        reasonOf(metadataOf('features: [Proxy]\n'), {
          supportedFeatures: ['Proxy'],
          skipFeatures: ['Proxy'],
        }),
        'excluded-feature',
      );
      assertSame(
        reasonOf(metadataOf('features: [Proxy]\n'), { supportedFeatures: [] }),
        'unsupported-feature',
      );
      assertSame(
        decideSkip(metadataOf('features: [Proxy]\n'), {
          supportedFeatures: ['Proxy'],
        }),
        null,
      );
      assertSame(decideSkip(metadataOf(''), {}), null);
    },
  },
  {
    name: 'a positive test passes in both variants',
    run: async () => {
      const { records, summary } = await runMemorySuite({
        'ok.js': fixture('passes', "assert.sameValue(1 + 1, 2, 'arithmetic');"),
      });

      assertSame(
        summarizeRecords(records),
        ['ok.js|non-strict|passed|', 'ok.js|strict|passed|'].join('\n'),
      );
      assertSame(summary.passed, 2);
    },
  },
  {
    name: 'the strict variant prepends the use strict directive',
    run: async () => {
      const { records } = await runMemorySuite({
        'octal.js': fixture('legacy octal literal', 'var octal = 010;'),
      });

      assertSame(
        summarizeRecords(records),
        [
          'octal.js|non-strict|passed|',
          'octal.js|strict|failed|parse-error',
        ].join('\n'),
      );
    },
  },
  {
    name: 'parse-phase negatives pass when the parser rejects the source',
    run: async () => {
      const { records } = await runMemorySuite({
        'bad-syntax.js': fixture(
          'syntax error',
          'var = ;',
          'negative:\n  phase: parse\n  type: SyntaxError\n',
        ),
      });

      assertSame(
        summarizeRecords(records),
        [
          'bad-syntax.js|non-strict|passed|',
          'bad-syntax.js|strict|passed|',
        ].join('\n'),
      );
    },
  },
  {
    name: 'runtime-phase negatives pass when the expected constructor is thrown',
    run: async () => {
      const { records } = await runMemorySuite({
        'throws.js': fixture(
          'throws Test262Error',
          "Test262Error.thrower('boom');",
          'negative:\n  phase: runtime\n  type: Test262Error\n',
        ),
      });

      assertSame(
        summarizeRecords(records),
        ['throws.js|non-strict|passed|', 'throws.js|strict|passed|'].join('\n'),
      );
    },
  },
  {
    name: 'negative tests fail when nothing is thrown',
    run: async () => {
      const { records } = await runMemorySuite({
        'quiet.js': fixture(
          'never throws',
          'var quiet = 1;',
          'negative:\n  phase: runtime\n  type: Test262Error\n',
        ),
      });

      assertSame(records[0].reason, 'expected-error-not-thrown');
      assertSame(records[0].status, 'failed');
    },
  },
  {
    name: 'negative tests fail when the thrown type does not match',
    run: async () => {
      const { records } = await runMemorySuite({
        'wrong-type.js': fixture(
          'throws the wrong constructor',
          "throw new OtherError('nope');",
          'negative:\n  phase: runtime\n  type: Test262Error\n',
        ),
      });

      assertSame(records[0].reason, 'wrong-error-type');
    },
  },
  {
    name: 'negative tests fail when the phase does not match',
    run: async () => {
      const { records } = await runMemorySuite({
        'late.js': fixture(
          'throws at runtime, not parse time',
          "Test262Error.thrower('late');",
          'negative:\n  phase: parse\n  type: SyntaxError\n',
        ),
        'early.js': fixture(
          'fails to parse, not at runtime',
          'var = ;',
          'negative:\n  phase: runtime\n  type: Test262Error\n',
        ),
      });

      assertSame(
        summarizeRecords(records),
        [
          'early.js|non-strict|failed|wrong-error-phase',
          'early.js|strict|failed|wrong-error-phase',
          'late.js|non-strict|failed|wrong-error-phase',
          'late.js|strict|failed|wrong-error-phase',
        ].join('\n'),
      );
    },
  },
  {
    name: 'negative tests fail when the expected type is not a realm binding',
    run: async () => {
      const { records } = await runMemorySuite({
        'unknown-type.js': fixture(
          'expects an error type the realm does not define',
          'throw 1;',
          'negative:\n  phase: runtime\n  type: TypeError\n',
        ),
      });

      assertSame(records[0].reason, 'unresolved-error-type');
    },
  },
  {
    name: 'includes are evaluated before the test source in declaration order',
    run: async () => {
      const { records } = await runMemorySuite({
        'uses-include.js': fixture(
          'uses a declared include',
          "assert.sameValue(add(2, 3), 5, 'add');",
          'includes: [add.js]\n',
        ),
      });

      assertSame(records[0].status, 'passed');
      assertSame(records.length, 2);
    },
  },
  {
    name: 'a missing include is reported as a load error',
    run: async () => {
      const { records } = await runMemorySuite({
        'missing-include.js': fixture(
          'declares an include that does not exist',
          'var a = 1;',
          'includes: [nowhere.js]\n',
        ),
      });

      assertSame(records[0].reason, 'load-error');
      assertSame(records[0].status, 'failed');
    },
  },
  {
    name: 'a throwing include is reported as a harness error',
    run: async () => {
      const { records } = await runMemorySuite({
        'bad-include.js': fixture(
          'declares an include that throws',
          'var a = 1;',
          'includes: [boom.js]\n',
        ),
      });

      assertSame(records[0].reason, 'harness-error');
    },
  },
  {
    name: 'raw tests run once without harness includes',
    run: async () => {
      const { records } = await runMemorySuite({
        'raw.js': fixture(
          'raw test',
          "if (typeof assert !== 'undefined') { throw 'harness leaked'; }",
          'flags: [raw]\n',
        ),
      });

      assertSame(summarizeRecords(records), 'raw.js|raw|passed|');
    },
  },
  {
    name: 'unsupported and excluded features are skipped without executing',
    run: async () => {
      const tests = {
        'proxy.js': fixture(
          'needs Proxy',
          "throw 'must not run';",
          'features: [Proxy]\n',
        ),
      };

      const skipped = await runMemorySuite(tests);
      assertSame(
        summarizeRecords(skipped.records),
        'proxy.js|null|skipped|unsupported-feature',
      );
      assertSame(skipped.summary.skipped, 1);

      const excluded = await runMemorySuite(tests, {
        supportedFeatures: ['Proxy'],
        skipFeatures: ['Proxy'],
      });
      assertSame(
        summarizeRecords(excluded.records),
        'proxy.js|null|skipped|excluded-feature',
      );
    },
  },
  {
    name: 'supported features run normally',
    run: async () => {
      const { records } = await runMemorySuite(
        {
          'supported.js': fixture(
            'declares a supported feature',
            "assert.sameValue(typeof add, 'undefined', 'no stray includes');",
            'features: [fixture-subset]\n',
          ),
        },
        { supportedFeatures: ['fixture-subset'] },
      );

      assertSame(records[0].status, 'passed');
      assertSame(JSON.stringify(records[0].features), '["fixture-subset"]');
    },
  },
  {
    name: 'malformed metadata is reported as a failed record, not a crash',
    run: async () => {
      const { records, summary } = await runMemorySuite({
        'no-frontmatter.js': 'var a = 1;\n',
      });

      assertSame(
        summarizeRecords(records),
        'no-frontmatter.js|null|failed|metadata-error',
      );
      assertSame(records[0].message, 'Missing Test262 frontmatter block');
      assertSame(summary.failed, 1);
    },
  },
  {
    name: 'unsupported syntax is reported as an engine error, not a pass',
    run: async () => {
      const { records } = await runMemorySuite({
        'update.js': fixture('uses an update expression', 'var a = 1; a++;'),
      });

      assertSame(records[0].reason, 'engine-error');
      assertSame(records[0].status, 'failed');
    },
  },
  {
    name: 'a missing test file is reported as a load error',
    run: async () => {
      const { records } = await runTest262Suite({
        engine,
        host: createMemoryHost({}),
        paths: ['gone.js'],
      });

      assertSame(summarizeRecords(records), 'gone.js|null|failed|load-error');
    },
  },
  {
    name: 'suite results are ordered by path regardless of input order',
    run: async () => {
      assertSame(
        JSON.stringify(sortTestPaths(['b/a.js', 'a/b.js', 'a/a.js'])),
        '["a/a.js","a/b.js","b/a.js"]',
      );

      const tests = {
        'zebra.js': fixture('z', 'var z = 1;', 'flags: [noStrict]\n'),
        'alpha.js': fixture('a', 'var a = 1;', 'flags: [noStrict]\n'),
        'middle.js': fixture('m', 'var m = 1;', 'flags: [noStrict]\n'),
      };

      const { records } = await runMemorySuite(tests, {
        paths: ['zebra.js', 'middle.js', 'alpha.js'],
      });

      assertSame(
        records.map((record) => record.file).join(','),
        'alpha.js,middle.js,zebra.js',
      );
    },
  },
  {
    name: 'report records use a stable key order and omit empty fields',
    run: () => {
      assertSame(
        formatRecordLine(
          createTestRecord({
            file: 'test/a.js',
            variant: 'strict',
            status: 'failed',
            reason: 'wrong-error-type',
            message: 'expected Test262Error',
            features: ['fixture-subset'],
          }),
        ),
        '{"type":"test","file":"test/a.js","variant":"strict","status":"failed","reason":"wrong-error-type","message":"expected Test262Error","features":["fixture-subset"]}',
      );

      assertSame(
        formatRecordLine(
          createTestRecord({
            file: 'test/a.js',
            variant: 'non-strict',
            status: 'passed',
          }),
        ),
        '{"type":"test","file":"test/a.js","variant":"non-strict","status":"passed"}',
      );
    },
  },
  {
    name: 'the summary record counts every status',
    run: () => {
      const records = [
        createTestRecord({ file: 'a.js', variant: 'strict', status: 'passed' }),
        createTestRecord({
          file: 'b.js',
          variant: null,
          status: 'skipped',
          reason: 'unsupported-feature',
        }),
        createTestRecord({
          file: 'c.js',
          variant: 'non-strict',
          status: 'failed',
          reason: 'engine-error',
        }),
      ];

      assertSame(
        formatRecordLine(createSummaryRecord(records)),
        '{"type":"summary","total":3,"passed":1,"failed":1,"skipped":1}',
      );
      assertSame(
        formatReport([...records, createSummaryRecord(records)]).split('\n')
          .length,
        5,
      );
    },
  },
  {
    name: 'the fixture suite produces the expected deterministic report',
    run: async () => {
      const host = await createFixtureTest262Host();
      const manifest = await readFixtureManifest(host);
      const paths = [...manifest.tests, ...manifest.malformed];

      const { records, summary } = await runTest262Suite({
        engine,
        host,
        paths,
        supportedFeatures: ['fixture-subset'],
      });

      assertSame(formatReport([...records, summary]), FIXTURE_REPORT);
    },
  },
  {
    name: 'the fixture manifest matches the fixture directory listing',
    run: async () => {
      const host = await createFixtureTest262Host();

      if (typeof host.listTests !== 'function') {
        return;
      }

      const manifest = await readFixtureManifest(host);
      const declared = [...manifest.tests, ...manifest.malformed].sort();

      assertSame((await host.listTests()).join(','), declared.join(','));
    },
  },
];
