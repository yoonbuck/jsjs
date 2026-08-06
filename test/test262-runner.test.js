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
  runTest262,
  runTest262Suite,
} from '../tools/test262/runner.js';
import {
  Test262SelectionError,
  parseTest262Manifest,
  resolveTest262Paths,
  selectTest262Paths,
  sortTestPaths,
} from '../tools/test262/selection.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatReport,
  formatRecordLine,
  formatReportLines,
} from '../tools/test262/report.js';
import {
  Test262CoverageError,
  collectTest262Inventory,
  formatCoverageLines,
  isTest262TestPath,
  renderCoverageSummary,
  summarizeTest262Coverage,
} from '../tools/test262/coverage.js';
import { createFixtureTest262Host } from './harness/test262-host.js';

/**
 * @typedef {import('../tools/test262/runner.js').Test262Host} Test262Host
 */

const engine = { createRealm, evaluateScript };

const FIXTURE_TESTS = [
  'test/feature-skip.js',
  'test/includes.js',
  'test/no-strict.js',
  'test/only-strict.js',
  'test/parse-negative.js',
  'test/positive.js',
  'test/raw.js',
  'test/runtime-negative.js',
  'test/supported-feature.js',
];

const FIXTURE_MALFORMED = [
  'malformed/missing-frontmatter.js',
  'malformed/negative-without-type.js',
];

/** Every fixture file, in the code-unit order the inventory reports them in. */
const FIXTURE_INVENTORY_PATHS = [...FIXTURE_MALFORMED, ...FIXTURE_TESTS];

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

const FIXTURE_TEST_LINES = [
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
];

const FIXTURE_MALFORMED_LINES = [
  '{"type":"test","file":"malformed/missing-frontmatter.js","variant":null,"status":"failed","reason":"metadata-error","message":"Missing Test262 frontmatter block"}',
  '{"type":"test","file":"malformed/negative-without-type.js","variant":null,"status":"failed","reason":"metadata-error","message":"negative requires both a phase and a type"}',
];

/** The default selection: exactly what `npm run test262:fixtures` writes. */
const FIXTURE_REPORT = [
  ...FIXTURE_TEST_LINES,
  '{"type":"summary","total":14,"passed":13,"failed":0,"skipped":1}',
  '',
].join('\n');

/** The `--include-malformed` selection, malformed paths sorting first. */
const FIXTURE_MALFORMED_REPORT = [
  ...FIXTURE_MALFORMED_LINES,
  ...FIXTURE_TEST_LINES,
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
    name: 'a failing assertion reports a deterministic unexpected-throw record',
    run: async () => {
      const { records, summary } = await runMemorySuite({
        'failing-assertion.js': fixture(
          'an assertion that does not hold',
          "assert.sameValue(1 + 1, 3, 'arithmetic');",
        ),
      });

      assertSame(
        formatReportLines([...records, summary]).join('\n'),
        [
          '{"type":"test","file":"failing-assertion.js","variant":"non-strict","status":"failed","reason":"unexpected-throw","message":"guest object with message: assert.sameValue failed: arithmetic"}',
          '{"type":"test","file":"failing-assertion.js","variant":"strict","status":"failed","reason":"unexpected-throw","message":"guest object with message: assert.sameValue failed: arithmetic"}',
          '{"type":"summary","total":2,"passed":0,"failed":2,"skipped":0}',
        ].join('\n'),
      );
    },
  },
  {
    name: 'an unexpected throw of a primitive describes the value without a phase guess',
    run: async () => {
      const { records } = await runMemorySuite({
        'throws-string.js': fixture(
          'throws a primitive at runtime',
          "throw 'boom';",
          'flags: [noStrict]\n',
        ),
      });

      assertSame(
        formatRecordLine(records[0]),
        '{"type":"test","file":"throws-string.js","variant":"non-strict","status":"failed","reason":"unexpected-throw","message":"guest string: boom"}',
      );
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
          'negative:\n  phase: runtime\n  type: UnknownErrorType\n',
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
      // Every ES5 construct now evaluates, so an engine limitation can no
      // longer be provoked from source. Model one directly: an engine whose
      // `evaluateScript` throws a host error (not a SyntaxError) for the test
      // body must be classified as engine-error and failed, never silently
      // passed. Harness includes still run through the real engine.
      const limitedEngine = {
        createRealm,
        /**
         * @param {any} realm
         * @param {string} source
         * @returns {any}
         */
        evaluateScript(realm, source) {
          if (source.includes('ENGINE_LIMITATION')) {
            throw new Error('synthetic engine limitation');
          }
          return evaluateScript(realm, source);
        },
      };

      const { records } = await runTest262Suite({
        engine: limitedEngine,
        host: createMemoryHost({
          'unsupported.js': fixture(
            'hits an engine limitation',
            'ENGINE_LIMITATION;',
          ),
        }),
        paths: ['unsupported.js'],
        supportedFeatures: [],
        skipFeatures: [],
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
    name: 'the manifest parser accepts the selection shape and rejects everything else',
    run: () => {
      assertSame(
        JSON.stringify(
          parseTest262Manifest(
            '{"tests":["b.js","a.js"],"malformed":["m.js"]}',
          ),
        ),
        '{"tests":["b.js","a.js"],"malformed":["m.js"]}',
      );
      assertSame(
        JSON.stringify(parseTest262Manifest('{"tests":["a.js"]}')),
        '{"tests":["a.js"],"malformed":[]}',
      );

      for (const text of [
        'not json',
        '[]',
        'null',
        '{"tests":"a.js"}',
        '{"tests":[1]}',
        '{"tests":[""]}',
        '{"tests":[],"malformed":{}}',
        '{"tests":[],"harnessDirectory":"harness"}',
      ]) {
        assertThrows(() => parseTest262Manifest(text), Test262SelectionError);
      }
    },
  },
  {
    name: 'selection prefers explicit paths, then the manifest, then a listing',
    run: () => {
      const manifest = { tests: ['b.js', 'a.js'], malformed: ['m.js'] };
      const listing = ['listed.js'];

      assertSame(
        selectTest262Paths({
          paths: ['explicit.js'],
          manifest,
          listing,
          includeMalformed: true,
        }).join(','),
        'explicit.js',
      );
      assertSame(
        selectTest262Paths({ manifest, listing }).join(','),
        'a.js,b.js',
      );
      assertSame(
        selectTest262Paths({ manifest, listing, includeMalformed: true }).join(
          ',',
        ),
        'a.js,b.js,m.js',
      );
      assertSame(selectTest262Paths({ listing }).join(','), 'listed.js');
      assertSame(selectTest262Paths({}).length, 0);
    },
  },
  {
    name: 'path resolution reads the manifest through the host and falls back to a listing',
    run: async () => {
      /**
       * @param {Partial<Test262Host>} overrides
       * @returns {Test262Host}
       */
      const hostWith = (overrides) => ({
        readTest: () => '',
        readInclude: () => '',
        ...overrides,
      });

      assertSame(
        (
          await resolveTest262Paths({
            host: hostWith({
              readManifest: () =>
                '{"tests":["b.js","a.js"],"malformed":["m.js"]}',
              listTests: () => ['listed.js'],
            }),
          })
        ).join(','),
        'a.js,b.js',
      );

      assertSame(
        (
          await resolveTest262Paths({
            host: hostWith({
              readManifest: () => {
                throw new Error('ENOENT');
              },
              listTests: () => ['listed.js'],
            }),
          })
        ).join(','),
        'listed.js',
      );

      assertSame(
        (
          await resolveTest262Paths({
            host: hostWith({ listTests: () => ['only-listed.js'] }),
          })
        ).join(','),
        'only-listed.js',
      );

      assertSame(
        (
          await resolveTest262Paths({
            host: hostWith({ readManifest: () => '{"tests":["ignored.js"]}' }),
            paths: ['chosen.js'],
          })
        ).join(','),
        'chosen.js',
      );

      let selectionError = null;

      try {
        await resolveTest262Paths({ host: hostWith({}) });
      } catch (error) {
        selectionError = error;
      }

      assertSame(selectionError instanceof Test262SelectionError, true);

      let manifestError = null;

      try {
        await resolveTest262Paths({
          // A readable but malformed manifest must fail loudly rather than
          // silently falling back to a listing that selects other tests.
          host: hostWith({
            readManifest: () => '{"tests":[1]}',
            listTests: () => ['listed.js'],
          }),
        });
      } catch (error) {
        manifestError = error;
      }

      assertSame(manifestError instanceof Test262SelectionError, true);
    },
  },
  {
    name: 'every host adapter selects the fixture tests through shared selection',
    run: async () => {
      const host = await createFixtureTest262Host();

      assertSame(
        (await resolveTest262Paths({ host })).join(','),
        FIXTURE_TESTS.join(','),
      );
      assertSame(
        (await resolveTest262Paths({ host, includeMalformed: true })).join(','),
        [...FIXTURE_MALFORMED, ...FIXTURE_TESTS].join(','),
      );
      assertSame(
        (await resolveTest262Paths({ host, paths: ['test/positive.js'] })).join(
          ',',
        ),
        'test/positive.js',
      );
    },
  },
  {
    name: 'the shared run produces the deterministic fixture report every adapter prints',
    run: async () => {
      const host = await createFixtureTest262Host();
      const run = await runTest262({
        engine,
        host,
        supportedFeatures: ['fixture-subset'],
      });

      assertSame(`${run.lines.join('\n')}\n`, FIXTURE_REPORT);
      assertSame(run.failed, 0);
      assertSame(formatReport([...run.records, run.summary]), FIXTURE_REPORT);

      const withMalformed = await runTest262({
        engine,
        host,
        includeMalformed: true,
        supportedFeatures: ['fixture-subset'],
      });

      assertSame(
        `${withMalformed.lines.join('\n')}\n`,
        FIXTURE_MALFORMED_REPORT,
      );
      assertSame(withMalformed.failed, 2);
    },
  },
  {
    name: 'the fixture manifest matches the fixture directory listing',
    run: async () => {
      const host = await createFixtureTest262Host();

      if (typeof host.listTests !== 'function') {
        return;
      }

      const declared = await resolveTest262Paths({
        host,
        includeMalformed: true,
      });

      assertSame(
        sortTestPaths(await host.listTests()).join(','),
        sortTestPaths(declared).join(','),
      );
    },
  },
  {
    name: 'the whole-tree inventory expands every file into records without executing any of them',
    run: async () => {
      const host = await createFixtureTest262Host();
      const inventory = await collectTest262Inventory({
        host,
        paths: [...FIXTURE_MALFORMED, ...FIXTURE_TESTS],
      });

      assertSame(inventory.files.join(','), FIXTURE_INVENTORY_PATHS.join(','));
      assertSame(inventory.totals.files, 11);
      assertSame(
        inventory.totals.records,
        15,
        'nine fixture tests expand into fifteen (file, variant) records',
      );
      assertSame(inventory.totals.malformed, 2);
      assertSame(inventory.malformed.join(','), FIXTURE_MALFORMED.join(','));
      assertSame(inventory.variants.get('test/positive.js'), 2);
      assertSame(inventory.variants.get('test/only-strict.js'), 1);
      assertSame(inventory.variants.get('test/no-strict.js'), 1);
      assertSame(inventory.variants.get('test/raw.js'), 1);
      assertSame(
        inventory.variants.get('test/feature-skip.js'),
        2,
        'a skipped test still expands into the records it would have run',
      );
      assertSame(
        inventory.variants.has('malformed/missing-frontmatter.js'),
        false,
        'a file whose frontmatter cannot be parsed contributes no records',
      );
    },
  },
  {
    name: 'the inventory counts unparseable frontmatter instead of dropping the file',
    run: async () => {
      const inventory = await collectTest262Inventory({
        host: createMemoryHost({
          'test/plain.js': fixture('Two variants', 'var value = 1;'),
          'test/raw.js': fixture(
            'One variant',
            'var value = 1;',
            'flags: [raw]\n',
          ),
          'test/broken.js': 'var withoutFrontmatter = 1;\n',
        }),
        paths: ['test/plain.js', 'test/raw.js', 'test/broken.js'],
      });

      assertSame(inventory.totals.files, 3);
      assertSame(inventory.totals.records, 3);
      assertSame(inventory.totals.malformed, 1);
      assertSame(inventory.malformed.join(','), 'test/broken.js');
    },
  },
  {
    name: 'the inventory fails loudly when a file cannot be read rather than shrinking the denominator',
    run: async () => {
      /** @type {unknown} */
      let failure;

      try {
        await collectTest262Inventory({
          host: createMemoryHost({}),
          paths: ['test/missing.js'],
        });
      } catch (error) {
        failure = error;
      }

      assertSame(failure instanceof Test262CoverageError, true);
    },
  },
  {
    name: 'only upstream test files count towards the whole-suite denominator',
    run: () => {
      assertSame(
        isTest262TestPath('test/language/types/undefined/S8.1_A1_T1.js'),
        true,
      );
      assertSame(
        isTest262TestPath('test/intl402/DateTimeFormat/prototype.js'),
        true,
      );
      assertSame(
        isTest262TestPath('test/language/module-code/instn-star_FIXTURE.js'),
        false,
        'a _FIXTURE.js support file is imported by a test, not run as one',
      );
      assertSame(isTest262TestPath('harness/assert.js'), false);
      assertSame(isTest262TestPath('tools/lint/lint.js'), false);
      assertSame(isTest262TestPath('test/README.md'), false);
    },
  },
  {
    name: 'coverage counts selected, attempted, and passed against the whole-suite totals',
    run: async () => {
      const host = await createFixtureTest262Host();
      const coverage = summarizeTest262Coverage({
        inventory: await collectTest262Inventory({
          host,
          paths: [...FIXTURE_MALFORMED, ...FIXTURE_TESTS],
        }),
        selected: FIXTURE_TESTS,
        records: (
          await runTest262Suite({
            engine,
            host,
            paths: FIXTURE_TESTS,
            supportedFeatures: ['fixture-subset'],
          })
        ).records,
      });

      assertSame(coverage.files.total, 11);
      assertSame(coverage.files.selected, 9);
      assertSame(
        coverage.files.attempted,
        8,
        'the feature-skipped file is selected but never attempted',
      );
      assertSame(coverage.files.passed, 8);
      assertSame(coverage.files.malformed, 2);
      assertSame(coverage.records.total, 15);
      assertSame(coverage.records.selected, 15);
      assertSame(coverage.records.attempted, 13);
      assertSame(coverage.records.passed, 13);
    },
  },
  {
    name: 'coverage percentages are whole-suite ratios rounded deterministically',
    run: async () => {
      const host = await createFixtureTest262Host();
      const coverage = summarizeTest262Coverage({
        inventory: await collectTest262Inventory({
          host,
          paths: [...FIXTURE_MALFORMED, ...FIXTURE_TESTS],
        }),
        selected: FIXTURE_TESTS,
        records: (
          await runTest262Suite({
            engine,
            host,
            paths: FIXTURE_TESTS,
            supportedFeatures: ['fixture-subset'],
          })
        ).records,
      });

      assertSame(coverage.files.selectedPercent, 81.818);
      assertSame(coverage.files.attemptedPercent, 72.727);
      assertSame(coverage.files.passedPercent, 72.727);
      assertSame(coverage.records.selectedPercent, 100);
      assertSame(coverage.records.attemptedPercent, 86.667);
      assertSame(coverage.records.passedPercent, 86.667);

      const empty = summarizeTest262Coverage({
        inventory: await collectTest262Inventory({
          host: createMemoryHost({}),
          paths: [],
        }),
        selected: [],
        records: [],
      });

      assertSame(empty.files.passedPercent, 0, 'an empty tree is not a crash');
      assertSame(empty.records.passedPercent, 0);
    },
  },
  {
    name: 'coverage records use a stable key order and report the inventory alongside the ratios',
    run: async () => {
      const host = await createFixtureTest262Host();
      const coverage = summarizeTest262Coverage({
        inventory: await collectTest262Inventory({
          host,
          paths: [...FIXTURE_MALFORMED, ...FIXTURE_TESTS],
        }),
        selected: FIXTURE_TESTS,
        records: (
          await runTest262Suite({
            engine,
            host,
            paths: FIXTURE_TESTS,
            supportedFeatures: ['fixture-subset'],
          })
        ).records,
      });

      assertSame(
        formatCoverageLines(coverage).join('\n'),
        [
          '{"type":"inventory","files":11,"records":15,"malformed":2}',
          '{"type":"coverage","scope":"files","total":11,"selected":9,"attempted":8,"passed":8,"selectedPercent":81.818,"attemptedPercent":72.727,"passedPercent":72.727}',
          '{"type":"coverage","scope":"records","total":15,"selected":15,"attempted":13,"passed":13,"selectedPercent":100,"attemptedPercent":86.667,"passedPercent":86.667}',
        ].join('\n'),
      );
    },
  },
  {
    name: 'the compact coverage summary renders a table that links to the detailed report',
    run: async () => {
      const host = await createFixtureTest262Host();
      const coverage = summarizeTest262Coverage({
        inventory: await collectTest262Inventory({
          host,
          paths: [...FIXTURE_MALFORMED, ...FIXTURE_TESTS],
        }),
        selected: FIXTURE_TESTS,
        records: (
          await runTest262Suite({
            engine,
            host,
            paths: FIXTURE_TESTS,
            supportedFeatures: ['fixture-subset'],
          })
        ).records,
      });
      const summary = renderCoverageSummary({
        coverage,
        reportPath: 'docs/test262-report.jsonl',
      });

      assertSame(
        summary,
        [
          '| Denominator     | Whole suite | Selected | Attempted | Passed | Passing |',
          '| --------------- | ----------- | -------- | --------- | ------ | ------- |',
          '| Files           | 11          | 9        | 8         | 8      | 72.727% |',
          '| (file, variant) | 15          | 15       | 13        | 13     | 86.667% |',
          '',
          '2 of the 11 files carry frontmatter this tooling cannot parse; they count as files and expand into no (file, variant) records.',
          'Full per-test records: [docs/test262-report.jsonl](docs/test262-report.jsonl).',
        ].join('\n'),
      );
    },
  },
];
