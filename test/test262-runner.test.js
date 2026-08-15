import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm, evaluateScript } from '../src/index.js';
import { createJsjsTest262Engine } from '../tools/test262/engine.js';
import {
  Test262MetadataError,
  expandVariants,
  parseTest262Metadata,
  resolveIncludes,
} from '../tools/test262/metadata.js';
import {
  DEFAULT_INCLUDES,
  UNSUPPORTED_FLAGS,
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
  COVERAGE_DOCUMENT_FILE,
  COVERAGE_MARKER_BEGIN,
  COVERAGE_MARKER_END,
  Test262CoverageError,
  collectTest262Inventory,
  formatCoverageLines,
  isTest262TestPath,
  readGeneratedBlock,
  renderCoverageSummary,
  replaceGeneratedBlock,
  summarizeTest262Coverage,
} from '../tools/test262/coverage.js';
import { createBrowserTest262Host } from '../tools/test262/adapters/browser.js';
import { createJscTest262Host } from '../tools/test262/adapters/jsc.js';
import { createFixtureTest262Host } from './harness/test262-host.js';

/**
 * @typedef {import('../tools/test262/runner.js').Test262Host} Test262Host
 */

const engine = createJsjsTest262Engine();

const FIXTURE_TESTS = [
  'test/async-promise.js',
  'test/feature-skip.js',
  'test/includes.js',
  'test/language/module-code/basic.js',
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
  /**
   * @param {string} file
   * @returns {string}
   */
  const readTest = (file) => {
    if (!Object.prototype.hasOwnProperty.call(tests, file)) {
      throw new Error(`No such fixture test: ${file}`);
    }

    return tests[file];
  };

  return {
    readTest,
    readModule(file) {
      return readTest(file);
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
  '{"type":"test","file":"test/async-promise.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/async-promise.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/feature-skip.js","variant":null,"status":"skipped","reason":"unsupported-feature","message":"unsupported features: Proxy, Reflect","features":["Proxy","Reflect"]}',
  '{"type":"test","file":"test/includes.js","variant":"non-strict","status":"passed"}',
  '{"type":"test","file":"test/includes.js","variant":"strict","status":"passed"}',
  '{"type":"test","file":"test/language/module-code/basic.js","variant":"non-strict","status":"passed"}',
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
  '{"type":"summary","total":17,"passed":16,"failed":0,"skipped":1}',
  '',
].join('\n');

/** The `--include-malformed` selection, malformed paths sorting first. */
const FIXTURE_MALFORMED_REPORT = [
  ...FIXTURE_MALFORMED_LINES,
  ...FIXTURE_TEST_LINES,
  '{"type":"summary","total":19,"passed":16,"failed":2,"skipped":1}',
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
    name: 'metadata parses CR-only Test262 frontmatter',
    run: () => {
      const metadata = parseTest262Metadata(
        [
          '/*---',
          'description: CR-only frontmatter',
          'includes: [assert.js]',
          'flags: [onlyStrict]',
          '---*/',
          'var value = 1;',
        ].join('\r'),
      );

      assertSame(metadata.description, 'CR-only frontmatter');
      assertSame(JSON.stringify(metadata.includes), '["assert.js"]');
      assertSame(JSON.stringify(metadata.flags), '["onlyStrict"]');
    },
  },
  {
    name: 'metadata folds a single blank line in a folded block scalar to one newline',
    run: () => {
      const metadata = parseTest262Metadata(
        [
          '/*---',
          'description: >-',
          '  para one',
          '  still one',
          '',
          '  para two',
          '---*/',
        ].join('\n'),
      );

      assertSame(metadata.description, 'para one still one\npara two');
    },
  },
  {
    name: 'metadata folds consecutive blank lines in a folded block scalar to a newline each',
    run: () => {
      const metadata = parseTest262Metadata(
        ['/*---', 'description: >-', '  a b', '', '', '  c d', '---*/'].join(
          '\n',
        ),
      );

      assertSame(metadata.description, 'a b\n\nc d');
    },
  },
  {
    name: 'metadata keeps more-indented lines literal inside a folded block scalar',
    run: () => {
      const metadata = parseTest262Metadata(
        [
          '/*---',
          'description: >-',
          '  line one',
          '',
          '      indented block',
          '      more block',
          '---*/',
        ].join('\n'),
      );

      assertSame(
        metadata.description,
        'line one\n\n    indented block\n    more block',
      );
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
    name: 'metadata accepts the valid module plus async flag combination',
    run: () => {
      const metadata = parseTest262Metadata(
        '/*---\ndescription: unsupported async module\nflags: [module, async]\n---*/\n',
      );

      assertSame(JSON.stringify(metadata.flags), '["module","async"]');
      assertSame(
        JSON.stringify(UNSUPPORTED_FLAGS),
        '["CanBlockIsFalse","CanBlockIsTrue","non-deterministic"]',
      );
    },
  },
  {
    name: 'the runner skips module plus async before invoking engine hooks',
    run: async () => {
      let engineHooks = 0;
      const metadata = parseTest262Metadata(
        '/*---\ndescription: unsupported async module\nflags: [module, async]\n---*/\n',
      );
      const decision = decideSkip(metadata);

      assertSame(decision?.reason, 'unsupported-flag-combination');
      assertSame(
        decision?.message,
        'unsupported flag combination: module and async',
      );

      const { records } = await runTest262Suite({
        engine: {
          createRealm() {
            engineHooks += 1;
            throw new Error('createRealm must not run');
          },
          evaluateScript() {
            engineHooks += 1;
            throw new Error('evaluateScript must not run');
          },
          async evaluateModule() {
            engineHooks += 1;
            throw new Error('evaluateModule must not run');
          },
          installDone() {
            engineHooks += 1;
            throw new Error('installDone must not run');
          },
          runJobs() {
            engineHooks += 1;
            throw new Error('runJobs must not run');
          },
        },
        host: createMemoryHost({
          'module-async.js':
            '/*---\ndescription: unsupported async module\nflags: [module, async]\n---*/\n',
        }),
        paths: ['module-async.js'],
      });

      assertSame(engineHooks, 0);
      assertSame(records.length, 1);
      assertSame(records[0].status, 'skipped');
      assertSame(records[0].reason, 'unsupported-flag-combination');
      assertSame(
        records[0].message,
        'unsupported flag combination: module and async',
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
    name: 'skip decisions retain unsupported flags while allowing module tests',
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

      assertSame(reasonOf(metadataOf('flags: [module]\n'), {}), null);
      assertSame(
        reasonOf(metadataOf('flags: [CanBlockIsFalse]\n'), {}),
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
        selectTest262Paths({
          paths: ['root.js', 'root_FIXTURE.js'],
          manifest,
          listing,
        }).join(','),
        'root.js',
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
    name: 'fixture dependency paths never produce root test records',
    run: async () => {
      const { records } = await runTest262({
        engine,
        host: createMemoryHost({
          'test/root.js': fixture(
            'root test',
            'var root = true;',
            'flags: [noStrict]\n',
          ),
          'test/root_FIXTURE.js': fixture(
            'dependency source',
            'var dependency = true;',
            'flags: [noStrict]\n',
          ),
        }),
        paths: ['test/root.js', 'test/root_FIXTURE.js'],
      });

      assertSame(records.length, 1);
      assertSame(records[0].file, 'test/root.js');
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
        readModule: () => '',
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

      assertSame(typeof host.readModule, 'function');
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
    name: 'browser and JSC adapters provide the same module-reading host operation',
    run: async () => {
      /** @type {string[]} */
      const browserReads = [];
      const browser = createBrowserTest262Host({
        root: 'https://fixtures.example/test262/',
        fetchImpl: async (path) => {
          browserReads.push(path);
          return {
            ok: true,
            status: 200,
            text: async () => 'export const value = 42;',
          };
        },
      });
      /** @type {string[]} */
      const jscReads = [];
      const jsc = createJscTest262Host({
        root: '/fixtures/test262/',
        readFileImpl: (path) => {
          jscReads.push(path);
          return 'export const value = 42;';
        },
      });

      assertSame(typeof browser.readModule, 'function');
      assertSame(typeof jsc.readModule, 'function');
      assertSame(
        await browser.readModule(
          'test/language/module-code/basic_FIXTURE.js',
          'test/language/module-code/basic.js',
        ),
        'export const value = 42;',
      );
      assertSame(
        jsc.readModule(
          'test/language/module-code/basic_FIXTURE.js',
          'test/language/module-code/basic.js',
        ),
        'export const value = 42;',
      );
      assertSame(
        browserReads.join(','),
        'https://fixtures.example/test262/test/language/module-code/basic_FIXTURE.js',
      );
      assertSame(
        jscReads.join(','),
        '/fixtures/test262/test/language/module-code/basic_FIXTURE.js',
      );
    },
  },
  {
    name: 'browser adapter reads modules through an injected URL-free resolver',
    run: async () => {
      /** @type {string[]} */
      const reads = [];
      const browser = createBrowserTest262Host({
        root: '/fixtures/test262',
        resolvePath(root, path) {
          return `${root}${path}`;
        },
        fetchImpl: async (path) => {
          reads.push(path);
          return {
            ok: true,
            status: 200,
            text: async () => 'export const value = 42;',
          };
        },
      });

      assertSame(
        await browser.readModule(
          'test/language/module-code/basic_FIXTURE.js',
          'test/language/module-code/basic.js',
        ),
        'export const value = 42;',
      );
      assertSame(
        reads.join(','),
        '/fixtures/test262/test/language/module-code/basic_FIXTURE.js',
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
      assertSame(inventory.totals.files, 13);
      assertSame(
        inventory.totals.records,
        18,
        'eleven fixture tests expand into eighteen (file, variant) records',
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
    name: 'the inventory excludes fixture dependencies even when explicitly named',
    run: async () => {
      const inventory = await collectTest262Inventory({
        host: createMemoryHost({
          'test/root.js': fixture(
            'Root source',
            'var value = 1;',
            'flags: [noStrict]\n',
          ),
          'test/root_FIXTURE.js': 'not a root test\n',
        }),
        paths: ['test/root.js', 'test/root_FIXTURE.js'],
      });

      assertSame(inventory.files.join(','), 'test/root.js');
      assertSame(inventory.totals.records, 1);
      assertSame(inventory.totals.malformed, 0);
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

      assertSame(coverage.files.total, 13);
      assertSame(coverage.files.selected, 11);
      assertSame(
        coverage.files.attempted,
        10,
        'the feature-skipped file is selected but never attempted',
      );
      assertSame(coverage.files.passed, 10);
      assertSame(coverage.files.malformed, 2);
      assertSame(coverage.records.total, 18);
      assertSame(coverage.records.selected, 18);
      assertSame(coverage.records.attempted, 16);
      assertSame(coverage.records.passed, 16);
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

      assertSame(coverage.files.selectedPercent, 84.615);
      assertSame(coverage.files.attemptedPercent, 76.923);
      assertSame(coverage.files.passedPercent, 76.923);
      assertSame(coverage.records.selectedPercent, 100);
      assertSame(coverage.records.attemptedPercent, 88.889);
      assertSame(coverage.records.passedPercent, 88.889);

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
          '{"type":"inventory","files":13,"records":18,"malformed":2}',
          '{"type":"coverage","scope":"files","total":13,"selected":11,"attempted":10,"passed":10,"selectedPercent":84.615,"attemptedPercent":76.923,"passedPercent":76.923}',
          '{"type":"coverage","scope":"records","total":18,"selected":18,"attempted":16,"passed":16,"selectedPercent":100,"attemptedPercent":88.889,"passedPercent":88.889}',
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
          '| Files           | 13          | 11       | 10        | 10     | 76.923% |',
          '| (file, variant) | 18          | 18       | 16        | 16     | 88.889% |',
          '',
          '2 of the 13 files carry frontmatter this tooling cannot parse; they count as files and expand into no (file, variant) records.',
          'Full per-test records: [docs/test262-report.jsonl](docs/test262-report.jsonl).',
        ].join('\n'),
      );
    },
  },
  {
    name: 'the coverage document target is docs/conformance.md',
    run: () => {
      assertSame(
        COVERAGE_DOCUMENT_FILE,
        'docs/conformance.md',
        'the renderer must target docs/conformance.md, not README.md',
      );
    },
  },
  {
    name: 'replaceGeneratedBlock preserves content outside the markers in the coverage document',
    run: () => {
      const doc = `# Conformance\n\n${COVERAGE_MARKER_BEGIN}\nold\n${COVERAGE_MARKER_END}\n\nTrailing.\n`;
      const updated = replaceGeneratedBlock(doc, 'new block');

      assertSame(updated.includes('new block'), true, 'block was inserted');
      assertSame(updated.includes('old'), false, 'old block was removed');
      assertSame(updated.includes('Trailing.'), true, 'trailing content kept');
    },
  },
  {
    name: 'readGeneratedBlock extracts the content between the coverage markers',
    run: () => {
      const block = 'generated table here';
      const doc = `before\n${COVERAGE_MARKER_BEGIN}\n\n${block}\n\n${COVERAGE_MARKER_END}\nafter`;
      assertSame(readGeneratedBlock(doc), block);
    },
  },
];
