/**
 * Focused pinned Test262 coverage for issue #25's supported ES2015 syntax.
 *
 * This deliberately stays small: it exercises meaningful positive and negative
 * cases from every implemented family without running the generated upstream
 * selection. The classified paths prove why two adjacent later-language cases
 * remain out of scope instead of turning an unsupported dependency into an
 * accidental feature claim.
 */

import { readFile } from 'node:fs/promises';
import { assertSame } from '../harness/assert.js';
import { createRealm, evaluateScript } from '../../src/index.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import {
  featureNames,
  parseFeatureManifest,
} from '../../tools/test262/features.js';
import { runTest262 } from '../../tools/test262/runner.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';
import {
  parseUpstreamSubset,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';
import { scanFrontmatter } from '../../tools/test262/es5-selection.js';

const KNOWN_GOOD_SUBSET_FILE = 'tools/test262/known-good-subset.json';

const KNOWN_GOOD_PATH_COUNT = 12434;

/**
 * Positive and negative upstream files for the implemented language forms,
 * sorted by repository-relative path.
 */
const SUPPORTED_PATHS = Object.freeze([
  'test/language/computed-property-names/class/method/constructor.js',
  'test/language/computed-property-names/class/static/method-prototype.js',
  'test/language/destructuring/binding/initialization-requires-object-coercible-null.js',
  'test/language/destructuring/binding/initialization-returns-normal-completion-for-empty-objects.js',
  'test/language/expressions/array/spread-mult-iter.js',
  'test/language/expressions/arrow-function/lexical-this.js',
  'test/language/expressions/arrow-function/throw-new.js',
  'test/language/expressions/assignment/destructuring/iterator-destructuring-property-reference-target-evaluation-order.js',
  'test/language/expressions/assignment/dstr/array-elem-iter-thrw-close.js',
  'test/language/expressions/assignment/dstr/obj-prop-put-order.js',
  'test/language/expressions/call/spread-err-sngl-err-itr-step.js',
  'test/language/expressions/class/accessor-name-inst/computed.js',
  'test/language/expressions/class/accessor-name-static/computed.js',
  'test/language/expressions/class/method-static/forbidden-ext/b1/cls-expr-meth-static-forbidden-ext-direct-access-prop-arguments.js',
  'test/language/expressions/class/method-static/forbidden-ext/b1/cls-expr-meth-static-forbidden-ext-direct-access-prop-caller.js',
  'test/language/expressions/class/method/forbidden-ext/b1/cls-expr-meth-forbidden-ext-direct-access-prop-arguments.js',
  'test/language/expressions/class/method/forbidden-ext/b1/cls-expr-meth-forbidden-ext-direct-access-prop-caller.js',
  'test/language/expressions/function/dflt-params-arg-val-undefined.js',
  'test/language/expressions/function/dflt-params-ref-later.js',
  'test/language/expressions/function/dflt-params-rest.js',
  'test/language/expressions/function/rest-param-strict-body.js',
  'test/language/expressions/object/computed-property-evaluation-order.js',
  'test/language/expressions/object/computed-property-name-topropertykey-before-value-evaluation.js',
  'test/language/expressions/tagged-template/cache-same-site.js',
  'test/language/expressions/template-literal/evaluation-order.js',
  'test/language/rest-parameters/rest-parameters-produce-an-array.js',
  'test/language/statements/class/method-static/forbidden-ext/b1/cls-decl-meth-static-forbidden-ext-direct-access-prop-arguments.js',
  'test/language/statements/class/method-static/forbidden-ext/b1/cls-decl-meth-static-forbidden-ext-direct-access-prop-caller.js',
  'test/language/statements/class/method/forbidden-ext/b1/cls-decl-meth-forbidden-ext-direct-access-prop-arguments.js',
  'test/language/statements/class/method/forbidden-ext/b1/cls-decl-meth-forbidden-ext-direct-access-prop-caller.js',
  'test/language/statements/class/subclass/derived-class-return-override-catch-super.js',
]);

/**
 * These paths are intentionally not feature claims. The first two need public
 * static class fields, while the tagged-template case includes Unicode
 * code-point and legacy-octal escape forms that this ES2015 subset rejects.
 */
const CLASSIFIED_PATHS = Object.freeze([
  'test/language/expressions/tagged-template/invalid-escape-sequences.js',
  'test/language/statements/class/elements/fields-computed-name-static-propname-constructor.js',
  'test/language/statements/class/elements/fields-computed-name-static-propname-prototype.js',
]);

const FOCUSED_PATHS = Object.freeze(
  [...SUPPORTED_PATHS, ...CLASSIFIED_PATHS].sort(),
);

/**
 * @param {readonly import('../../tools/test262/report.js').Test262TestRecord[]} records
 * @param {string} file
 * @returns {import('../../tools/test262/report.js').Test262TestRecord[]}
 */
function recordsFor(records, file) {
  return records.filter((record) => record.file === file);
}

export default [
  {
    name: 'focused ES2015 syntax Test262 files pass and out-of-scope neighbors stay classified',
    run: async () => {
      assertSame(
        JSON.stringify(SUPPORTED_PATHS),
        JSON.stringify([...SUPPORTED_PATHS].sort()),
        'supported Test262 paths must stay lexicographically sorted',
      );
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const manifest = parseFeatureManifest(
        await readFile('tools/test262/features.json', 'utf8'),
      );
      const { summary, records } = await runTest262({
        engine: { createRealm, evaluateScript },
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        paths: FOCUSED_PATHS,
        supportedFeatures: featureNames(manifest),
        skipFeatures: [],
      });
      const supportedRecords = records.filter((record) =>
        SUPPORTED_PATHS.includes(record.file),
      );
      const supportedFailures = supportedRecords.filter(
        (record) => record.status !== 'passed',
      );

      assertSame(
        supportedFailures.length,
        0,
        `supported syntax files did not pass: ${JSON.stringify(supportedFailures)}`,
      );

      for (const file of CLASSIFIED_PATHS.slice(1)) {
        const classified = recordsFor(records, file);

        assertSame(classified.length, 1, `${file} record count`);
        assertSame(classified[0].status, 'skipped', `${file} status`);
        assertSame(
          classified[0].reason,
          'unsupported-feature',
          `${file} must remain a class-fields classification`,
        );
        assertSame(
          classified[0].features?.includes('class-static-fields-public'),
          true,
          `${file} must name the missing public static class-fields dependency`,
        );
      }

      const invalidEscapes = recordsFor(
        records,
        'test/language/expressions/tagged-template/invalid-escape-sequences.js',
      );

      assertSame(
        invalidEscapes.length,
        2,
        'tagged-template invalid escape variants',
      );
      assertSame(
        invalidEscapes.every(
          (record) =>
            record.status === 'failed' &&
            record.reason === 'parse-error' &&
            record.message?.includes('Octal literal in template string') ===
              true,
        ),
        true,
        `tagged-template Unicode code-point and legacy-octal escapes must remain classified: ${JSON.stringify(invalidEscapes)}`,
      );
      assertSame(summary.passed, supportedRecords.length);
      assertSame(summary.failed, invalidEscapes.length);
      assertSame(summary.skipped, 2);
    },
  },
  {
    name: 'generated selection retains every path from the known-good subset',
    run: async () => {
      const [pin, baselineText, currentText] = await Promise.all([
        readTest262Pin(),
        readFile(KNOWN_GOOD_SUBSET_FILE, 'utf8'),
        readFile('tools/test262/upstream-subset.json', 'utf8'),
      ]);
      const baselinePaths = upstreamSubsetPaths(
        parseUpstreamSubset(baselineText),
      );
      const currentPaths = new Set(
        upstreamSubsetPaths(parseUpstreamSubset(currentText)),
      );
      const missing = baselinePaths.filter((path) => !currentPaths.has(path));
      const baselinePathSet = new Set(baselinePaths);
      const nonbaselinePaths = [...currentPaths].filter(
        (path) => !baselinePathSet.has(path),
      );
      const nonbaselineSources = await Promise.all(
        nonbaselinePaths.map((path) =>
          readFile(`${pin.checkoutPath}/${path}`, 'utf8'),
        ),
      );
      const nonbaselineUntagged = nonbaselinePaths.filter(
        (path, index) =>
          !scanFrontmatter(nonbaselineSources[index]).hasFeatures,
      );

      assertSame(
        baselinePaths.length,
        KNOWN_GOOD_PATH_COUNT,
        'the preserved known-good subset must retain its path count',
      );
      assertSame(
        missing.length,
        0,
        `current selection dropped pre-Task 9 paths: ${JSON.stringify(missing)}`,
      );
      assertSame(
        nonbaselineUntagged.length,
        0,
        `generated selection admitted nonbaseline untagged paths: ${JSON.stringify(nonbaselineUntagged.slice(0, 10))}`,
      );
    },
  },
];
