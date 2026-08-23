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
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
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
import {
  isCandidatePath,
  parseEs5Selection,
  scanFrontmatter,
} from '../../tools/test262/es5-selection.js';
import { ASYNC_RUNTIME_RELEASE_MANIFEST } from '../../tools/test262/async-runtime-release-manifest.js';

const KNOWN_GOOD_SUBSET_FILE = 'tools/test262/known-good-subset.json';

const KNOWN_GOOD_PATH_COUNT = 12434;

const GENERATED_PATH_COUNT = 14272;
const PROMOTION_GROUP = 'es2015/audit-passing-promotion';
const H0_PROMOTION_GROUP = 'es2015/h0-cross-realm-passed';
const H0_PROMOTION_ROOT_COUNT = 40;
const M1_PROMOTION_GROUP = 'es2015/m1-reflect';
const M1_PROMOTION_ROOT_COUNT = 103;

const ISSUE_25_EXPANSION_PATH_COUNT = 1684;

const ISSUE_25_EXPANSION_FEATURES = Object.freeze([
  'arrow-function',
  'class',
  'computed-property-names',
  'default-parameters',
  'destructuring-assignment',
  'destructuring-binding',
  'rest-parameters',
  'spread-syntax',
  'template',
]);

const GENERATOR_ROOTS = Object.freeze(
  ASYNC_RUNTIME_RELEASE_MANIFEST.generator.records.map((record) => record.path),
);

const APPROVED_UNTAGGED_GENERATOR_ROOTS = Object.freeze(
  ASYNC_RUNTIME_RELEASE_MANIFEST.generator.records
    .filter((record) => record.features.length === 0)
    .map((record) => record.path),
);

const SYMBOL_SPECIES_SUBCLASSING_PATH =
  'test/built-ins/Symbol/species/subclassing.js';

/**
 * Positive and negative upstream files for the implemented language forms,
 * sorted by repository-relative path.
 */
const SUPPORTED_PATHS = Object.freeze([
  'test/built-ins/Function/prototype/arguments/prop-desc.js',
  'test/built-ins/Function/prototype/caller-arguments/accessor-properties.js',
  'test/built-ins/Function/prototype/caller/prop-desc.js',
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
  'test/language/statements/class/definition/constructor-property.js',
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
        engine: createJsjsTest262Engine(),
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
    name: 'generated selection retains issue #25, generator, H0, and M1 promotion roots',
    run: async () => {
      const pin = await readTest262Pin();
      const [policyText, baselineText, currentText, symbolSpeciesSource] =
        await Promise.all([
          readFile('tools/test262/es5-selection.json', 'utf8'),
          readFile(KNOWN_GOOD_SUBSET_FILE, 'utf8'),
          readFile('tools/test262/upstream-subset.json', 'utf8'),
          readFile(
            `${pin.checkoutPath}/${SYMBOL_SPECIES_SUBCLASSING_PATH}`,
            'utf8',
          ),
        ]);
      const policy = parseEs5Selection(policyText);
      const baselinePaths = upstreamSubsetPaths(
        parseUpstreamSubset(baselineText),
      );
      const currentSubset = parseUpstreamSubset(currentText);
      const promotion = currentSubset.groups.filter(
        (group) => group.name === PROMOTION_GROUP,
      );
      const h0Promotion = currentSubset.groups.filter(
        (group) => group.name === H0_PROMOTION_GROUP,
      );
      const h0PromotionPaths = new Set(
        h0Promotion.flatMap((group) => group.paths),
      );
      const m1Promotion = currentSubset.groups.filter(
        (group) => group.name === M1_PROMOTION_GROUP,
      );
      const m1PromotionPaths = new Set(
        m1Promotion.flatMap((group) => group.paths),
      );
      const currentPaths = new Set(
        currentSubset.groups
          .filter((group) => group.name !== PROMOTION_GROUP)
          .flatMap((group) => group.paths),
      );
      const missing = baselinePaths.filter((path) => !currentPaths.has(path));
      const baselinePathSet = new Set(baselinePaths);
      const nonbaselinePaths = [...currentPaths].filter(
        (path) => !baselinePathSet.has(path),
      );
      const issue25ExpansionPaths = nonbaselinePaths.filter(
        (path) =>
          !GENERATOR_ROOTS.includes(path) &&
          !h0PromotionPaths.has(path) &&
          !m1PromotionPaths.has(path),
      );
      const nonbaselineSources = await Promise.all(
        nonbaselinePaths.map((path) =>
          readFile(`${pin.checkoutPath}/${path}`, 'utf8'),
        ),
      );
      const nonbaselineFrontmatter = nonbaselineSources.map(scanFrontmatter);
      const nonbaselineWithoutExpansionFeature = nonbaselinePaths.filter(
        (path, index) =>
          !GENERATOR_ROOTS.includes(path) &&
          !h0PromotionPaths.has(path) &&
          !m1PromotionPaths.has(path) &&
          !nonbaselineFrontmatter[index].features.some((feature) =>
            policy.expansionFeatures.includes(feature),
          ),
      );
      const untaggedGeneratorRoots = GENERATOR_ROOTS.filter((path) => {
        const index = nonbaselinePaths.indexOf(path);
        return (
          index >= 0 &&
          !nonbaselineFrontmatter[index].features.some((feature) =>
            policy.expansionFeatures.includes(feature),
          )
        );
      });
      const nonbaselineOutsideClaimedFeatureArea = nonbaselinePaths.filter(
        (path, index) => {
          if (h0PromotionPaths.has(path) || m1PromotionPaths.has(path)) {
            return false;
          }

          const frontmatter = nonbaselineFrontmatter[index];

          return !isCandidatePath(
            path,
            {
              declaresFeatures: frontmatter.hasFeatures,
              features: frontmatter.features,
              isModule: frontmatter.isModule,
              parsesUnderEngineGrammar: true,
              includesParseUnderEngineGrammar: true,
            },
            policy,
            baselinePathSet,
          );
        },
      );
      const symbolSpeciesFrontmatter = scanFrontmatter(symbolSpeciesSource);

      assertSame(
        baselinePaths.length,
        KNOWN_GOOD_PATH_COUNT,
        'the preserved known-good subset must retain its path count',
      );
      assertSame(
        currentPaths.size,
        GENERATED_PATH_COUNT,
        'the generated selection must retain its exact pinned path count',
      );
      assertSame(
        promotion.length,
        1,
        'the exact ES2015 promotion must stay outside the generated ES5 selection',
      );
      assertSame(
        promotion[0]?.paths.length,
        6323,
        'the exact ES2015 promotion must retain its reviewed root count',
      );
      assertSame(
        h0Promotion.length,
        1,
        'the exact H0 promotion group must remain unique',
      );
      assertSame(
        h0Promotion[0]?.paths.length,
        H0_PROMOTION_ROOT_COUNT,
        'the exact H0 promotion must retain its complete-pass root count',
      );
      assertSame(
        m1Promotion.length,
        1,
        'the exact M1 promotion group must remain unique',
      );
      assertSame(
        m1Promotion[0]?.paths.length,
        M1_PROMOTION_ROOT_COUNT,
        'the exact M1 promotion must retain its complete-pass root count',
      );
      assertSame(
        issue25ExpansionPaths.length,
        ISSUE_25_EXPANSION_PATH_COUNT,
        'the generated selection must retain every pinned issue #25 expansion path',
      );
      assertSame(
        currentPaths.size - baselinePaths.length,
        ISSUE_25_EXPANSION_PATH_COUNT +
          GENERATOR_ROOTS.length +
          H0_PROMOTION_ROOT_COUNT +
          M1_PROMOTION_ROOT_COUNT,
        'the generated total must consist of the pinned baseline, issue #25 expansion, layer-4 generator roots, H0 complete-pass roots, and M1 Reflect roots',
      );
      assertSame(
        missing.length,
        0,
        `current selection dropped pre-Task 9 paths: ${JSON.stringify(missing)}`,
      );
      assertSame(
        JSON.stringify(
          policy.expansionFeatures.filter(
            (feature) => feature !== 'generators',
          ),
        ),
        JSON.stringify(ISSUE_25_EXPANSION_FEATURES),
        'issue #25 must retain this exact sorted expansion feature boundary',
      );
      assertSame(
        policy.expansionFeatures.includes('generators'),
        true,
        'layer-4 generator expansion must remain enabled',
      );
      assertSame(
        nonbaselineWithoutExpansionFeature.length,
        0,
        `generated selection admitted nonbaseline paths without an issue #25 expansion tag: ${JSON.stringify(nonbaselineWithoutExpansionFeature.slice(0, 10))}`,
      );
      assertSame(
        JSON.stringify([...untaggedGeneratorRoots].sort()),
        JSON.stringify([...APPROVED_UNTAGGED_GENERATOR_ROOTS].sort()),
        'only the two approved generator roots may lack an expansion metadata feature',
      );
      assertSame(
        GENERATOR_ROOTS.length,
        11,
        'the layer-4 contract must retain exactly eleven generator roots',
      );
      assertSame(
        APPROVED_UNTAGGED_GENERATOR_ROOTS.length,
        2,
        'the layer-4 contract must retain exactly two approved untagged generator roots',
      );
      assertSame(
        GENERATOR_ROOTS.every((path) => currentPaths.has(path)),
        true,
        'generated selection must retain all eleven layer-4 generator roots',
      );
      assertSame(
        nonbaselineOutsideClaimedFeatureArea.length,
        0,
        `generated selection admitted nonbaseline paths outside their exact claimed feature area: ${JSON.stringify(nonbaselineOutsideClaimedFeatureArea.slice(0, 10))}`,
      );
      assertSame(
        JSON.stringify(symbolSpeciesFrontmatter.features),
        JSON.stringify(['Symbol.species']),
        'the pinned Symbol.species subclassing case must retain its actual metadata',
      );
      assertSame(
        baselinePathSet.has(SYMBOL_SPECIES_SUBCLASSING_PATH),
        false,
        'the pinned Symbol.species subclassing case must be nonbaseline',
      );
      assertSame(
        currentPaths.has(SYMBOL_SPECIES_SUBCLASSING_PATH),
        false,
        'the current subset must exclude the pinned Symbol.species subclassing case',
      );
      assertSame(
        isCandidatePath(
          SYMBOL_SPECIES_SUBCLASSING_PATH,
          {
            declaresFeatures: symbolSpeciesFrontmatter.hasFeatures,
            features: symbolSpeciesFrontmatter.features,
            isModule: symbolSpeciesFrontmatter.isModule,
            parsesUnderEngineGrammar: true,
            includesParseUnderEngineGrammar: true,
          },
          policy,
          baselinePathSet,
        ),
        false,
        'the committed policy must reject the pinned nonbaseline Symbol.species subclassing case',
      );
    },
  },
];
