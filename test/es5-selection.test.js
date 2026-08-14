import { assertSame, assertThrows } from './harness/assert.js';
import {
  Es5SelectionError,
  ES5_SELECTION_VERSION,
  EXCLUSION_CATEGORIES,
  buildUpstreamSubset,
  deriveGroupName,
  isCandidatePath,
  isSelectedPath,
  matchExclusion,
  parseEs5Selection,
  scanFrontmatter,
  serializeUpstreamSubset,
} from '../tools/test262/es5-selection.js';
import { parseUpstreamSubset } from '../tools/test262/upstream.js';

const ES2015_SYNTAX_FEATURES = Object.freeze([
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

const SELECTION_SYNTAX_FEATURES = Object.freeze(
  ES2015_SYNTAX_FEATURES.filter(
    (feature) => feature !== 'spread-syntax' && feature !== 'template',
  ),
);

const UNSUPPORTED_NEIGHBOR_FEATURES = Object.freeze([
  'async-iteration',
  'async-functions',
  'class-fields-private',
  'class-fields-public',
  'class-methods-private',
  'class-static-block',
  'class-static-fields-private',
  'class-static-fields-public',
  'class-static-methods-private',
  'decorators',
  'generators',
  'new.target',
  'object-rest',
  'object-spread',
]);

/**
 * A minimal, well-formed policy the predicate and grouping tests build on.
 * Constructed rather than read so the suite stays portable and needs no
 * checkout.
 *
 * @param {Partial<{
 *   excludedDirectories: string[],
 *   builtins: string[],
 *   excludedLanguageDirectories: string[],
 *   featureAreas: object[],
 *   expansionFeatures: string[],
 *   exclusions: object[],
 * }>} [overrides]
 * @returns {string}
 */
function policyText(overrides = {}) {
  return JSON.stringify({
    version: ES5_SELECTION_VERSION,
    excludedDirectories: overrides.excludedDirectories ?? [
      'test/intl402',
      'test/staging',
    ],
    builtins: overrides.builtins ?? ['Array', 'Object', 'String'],
    excludedLanguageDirectories: overrides.excludedLanguageDirectories ?? [
      'export',
      'module-code',
    ],
    featureAreas: overrides.featureAreas ?? [],
    expansionFeatures: overrides.expansionFeatures ?? [
      ...ES2015_SYNTAX_FEATURES,
    ],
    exclusions: overrides.exclusions ?? [],
  });
}

const CANDIDATE_INFO = Object.freeze({
  declaresFeatures: false,
  features: Object.freeze([]),
  isModule: false,
  parsesUnderEngineGrammar: true,
  includesParseUnderEngineGrammar: true,
});

/**
 * @param {string} path
 * @param {Parameters<typeof isCandidatePath>[1]} info
 * @param {Parameters<typeof isCandidatePath>[2]} policy
 * @returns {boolean}
 */
function isKnownGoodCandidate(path, info, policy) {
  return isCandidatePath(path, info, policy, new Set([path]));
}

/**
 * A policy that claims one feature area, for the feature-gate tests.
 *
 * @returns {string}
 */
function featureAreaPolicyText() {
  return policyText({
    builtins: ['Array', 'Object', 'String', 'Symbol'],
    featureAreas: [
      {
        prefix: 'test/built-ins/Symbol',
        features: ['Symbol', 'Symbol.iterator'],
        reason: 'ES2015 Symbols are implemented; see docs/conformance.md.',
      },
    ],
  });
}

/**
 * A portable model of the exact syntax claim boundary. The Node-only CI
 * contract separately asserts that the committed JSON policy has this shape.
 *
 * @returns {string}
 */
function es2015SyntaxPolicyText() {
  return policyText({
    excludedLanguageDirectories: ['export', 'import', 'module-code'],
    featureAreas: [
      {
        prefix: 'test/language/expressions',
        features: [...SELECTION_SYNTAX_FEATURES],
        reason: 'The supported ES2015 expression syntax forms are implemented.',
      },
    ],
  });
}

export default [
  {
    name: 'the ES2015 syntax policy contract claims only the supported surface',
    run: () => {
      const policy = parseEs5Selection(es2015SyntaxPolicyText());
      const languageAreas = policy.featureAreas.filter((area) =>
        area.prefix.startsWith('test/language/'),
      );
      const claimedSyntaxFeatures = [
        ...new Set(
          languageAreas.flatMap((area) =>
            area.features.filter((feature) =>
              SELECTION_SYNTAX_FEATURES.includes(feature),
            ),
          ),
        ),
      ].sort();

      assertSame(
        JSON.stringify(policy.excludedLanguageDirectories),
        JSON.stringify(['export', 'import', 'module-code']),
        'the policy must remove only the obsolete computed-property-names, destructuring, and rest-parameters directory exclusions',
      );
      assertSame(
        JSON.stringify(claimedSyntaxFeatures),
        JSON.stringify(SELECTION_SYNTAX_FEATURES),
        'the policy must claim each selected ES2015 syntax tag exactly once through narrow language prefixes',
      );
      assertSame(
        policy.featureAreas
          .find((area) => area.prefix === 'test/language')
          ?.features.some((feature) =>
            SELECTION_SYNTAX_FEATURES.includes(feature),
          ) ?? false,
        false,
        'the policy must not reopen all of test/language for the newly claimed ES2015 syntax',
      );

      for (const neighbor of UNSUPPORTED_NEIGHBOR_FEATURES) {
        assertSame(
          languageAreas.some((area) => area.features.includes(neighbor)),
          false,
          `the policy must not claim neighboring unsupported feature ${neighbor}`,
        );
      }

      /** @type {readonly (readonly [string, readonly string[]])[]} */
      const unsupportedCases = [
        [
          'test/language/expressions/arrow-function/neighbor.js',
          ['arrow-function', 'new.target'],
        ],
        [
          'test/language/expressions/class/neighbor.js',
          ['class', 'class-static-fields-public'],
        ],
        [
          'test/language/expressions/object/neighbor.js',
          ['computed-property-names', 'object-spread'],
        ],
        [
          'test/language/expressions/function/neighbor.js',
          ['async-functions', 'default-parameters'],
        ],
        [
          'test/language/expressions/class/neighbor-generator.js',
          ['class', 'generators'],
        ],
      ];

      for (const [path, features] of unsupportedCases) {
        assertSame(
          isCandidatePath(
            path,
            { ...CANDIDATE_INFO, declaresFeatures: true, features },
            policy,
          ),
          false,
          `the policy must exclude ${features.join(', ')} from ${path}`,
        );
      }
      assertSame(
        isCandidatePath(
          'test/language/expressions/class/module-neighbor.js',
          {
            ...CANDIDATE_INFO,
            declaresFeatures: true,
            features: ['class'],
            isModule: true,
          },
          policy,
        ),
        false,
        'the policy must exclude module-flagged syntax even under a claimed prefix',
      );
    },
  },
  {
    name: 'es5-selection parses a well-formed policy and freezes it',
    run: () => {
      const policy = parseEs5Selection(policyText());

      assertSame(policy.version, ES5_SELECTION_VERSION);
      assertSame(
        JSON.stringify(policy.excludedDirectories),
        JSON.stringify(['test/intl402', 'test/staging']),
      );
      assertSame(
        JSON.stringify(policy.builtins),
        JSON.stringify(['Array', 'Object', 'String']),
      );
      assertSame(Object.isFrozen(policy), true);
      assertSame(Object.isFrozen(policy.exclusions), true);
    },
  },
  {
    name: 'es5-selection rejects invalid JSON',
    run: () => {
      assertThrows(() => parseEs5Selection('{not json'), Es5SelectionError);
    },
  },
  {
    name: 'es5-selection rejects a non-object document',
    run: () => {
      assertThrows(() => parseEs5Selection('[]'), Es5SelectionError);
      assertThrows(() => parseEs5Selection('42'), Es5SelectionError);
    },
  },
  {
    name: 'es5-selection rejects an unknown top-level key',
    run: () => {
      const text = JSON.stringify({
        version: ES5_SELECTION_VERSION,
        excludedDirectories: [],
        builtins: ['Array'],
        excludedLanguageDirectories: [],
        exclusions: [],
        surprise: true,
      });

      assertThrows(() => parseEs5Selection(text), Es5SelectionError);
    },
  },
  {
    name: 'es5-selection rejects a missing required key',
    run: () => {
      const text = JSON.stringify({
        version: ES5_SELECTION_VERSION,
        builtins: ['Array'],
        excludedLanguageDirectories: [],
        exclusions: [],
      });

      assertThrows(() => parseEs5Selection(text), Es5SelectionError);
    },
  },
  {
    name: 'es5-selection rejects the wrong schema version',
    run: () => {
      const text = policyText().replace(
        `"version":${ES5_SELECTION_VERSION}`,
        `"version":${ES5_SELECTION_VERSION + 1}`,
      );

      assertThrows(() => parseEs5Selection(text), Es5SelectionError);
    },
  },
  {
    name: 'es5-selection rejects an excluded directory outside test/',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({ excludedDirectories: ['staging', 'test/intl402'] }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an unsorted directory or builtin list',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              excludedDirectories: ['test/staging', 'test/intl402'],
            }),
          ),
        Es5SelectionError,
      );
      assertThrows(
        () => parseEs5Selection(policyText({ builtins: ['Object', 'Array'] })),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects a duplicated builtin',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({ builtins: ['Array', 'Array', 'Object'] }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an empty builtins list',
    run: () => {
      assertThrows(
        () => parseEs5Selection(policyText({ builtins: [] })),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an exclusion with neither path nor prefix',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [{ category: 'post-es5-builtin', reason: 'x' }],
            }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an exclusion naming both path and prefix',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [
                {
                  path: 'test/a.js',
                  prefix: 'test/a',
                  category: 'post-es5-builtin',
                  reason: 'x',
                },
              ],
            }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an exclusion with an unknown category',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [
                { prefix: 'test/built-ins/Map', category: 'nope', reason: 'x' },
              ],
            }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an exclusion with an empty reason',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [
                {
                  prefix: 'test/built-ins/Map',
                  category: 'post-es5-builtin',
                  reason: '  ',
                },
              ],
            }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects an exclusion path outside test/',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [
                {
                  path: 'src/thing.js',
                  category: 'post-es5-builtin',
                  reason: 'x',
                },
              ],
            }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection rejects unsorted or duplicated exclusions',
    run: () => {
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [
                {
                  prefix: 'test/built-ins/Set',
                  category: 'post-es5-builtin',
                  reason: 'x',
                },
                {
                  prefix: 'test/built-ins/Map',
                  category: 'post-es5-builtin',
                  reason: 'x',
                },
              ],
            }),
          ),
        Es5SelectionError,
      );
      assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              exclusions: [
                {
                  prefix: 'test/built-ins/Map',
                  category: 'post-es5-builtin',
                  reason: 'x',
                },
                {
                  prefix: 'test/built-ins/Map',
                  category: 'post-es5-builtin',
                  reason: 'y',
                },
              ],
            }),
          ),
        Es5SelectionError,
      );
    },
  },
  {
    name: 'es5-selection accepts every allowed category',
    run: () => {
      const exclusions = [...EXCLUSION_CATEGORIES]
        .map((category, index) => ({
          prefix: `test/z-${index}`,
          category,
          reason: 'ES5.1 clause citation',
        }))
        .sort((a, b) => (a.prefix < b.prefix ? -1 : 1));
      const policy = parseEs5Selection(policyText({ exclusions }));

      assertSame(policy.exclusions.length, EXCLUSION_CATEGORIES.length);
    },
  },
  {
    name: 'scanFrontmatter detects features, module flag, and includes',
    run: () => {
      const scan = scanFrontmatter(
        [
          '/*---',
          'includes: [assert.js, propertyHelper.js]',
          'flags: [module]',
          'features: [Symbol]',
          '---*/',
        ].join('\n'),
      );

      assertSame(scan.hasFeatures, true);
      assertSame(JSON.stringify(scan.features), JSON.stringify(['Symbol']));
      assertSame(scan.isModule, true);
      assertSame(
        JSON.stringify(scan.includes),
        JSON.stringify(['assert.js', 'propertyHelper.js']),
      );
    },
  },
  {
    name: 'scanFrontmatter lists a flow-sequence feature tag but not a block-style one',
    run: () => {
      const flow = scanFrontmatter(
        ['/*---', 'features: [Symbol, Symbol.iterator]', '---*/'].join('\n'),
      );

      assertSame(flow.hasFeatures, true);
      assertSame(
        JSON.stringify(flow.features),
        JSON.stringify(['Symbol', 'Symbol.iterator']),
      );

      // Block-style frontmatter is real YAML this textual scanner does not
      // read, so it must report the tag is present while listing nothing:
      // an unlisted tag can never be matched by a claim, which keeps the
      // pre-existing "excluded" answer for those files.
      const block = scanFrontmatter(
        ['/*---', 'features:', '  - Symbol', '---*/'].join('\n'),
      );

      assertSame(block.hasFeatures, true);
      assertSame(JSON.stringify(block.features), JSON.stringify([]));
    },
  },
  {
    name: 'scanFrontmatter reports no features or module on a plain test',
    run: () => {
      const scan = scanFrontmatter(
        ['/*---', 'description: plain', 'flags: [onlyStrict]', '---*/'].join(
          '\n',
        ),
      );

      assertSame(scan.hasFeatures, false);
      assertSame(JSON.stringify(scan.features), JSON.stringify([]));
      assertSame(scan.isModule, false);
      assertSame(JSON.stringify(scan.includes), JSON.stringify([]));
    },
  },
  {
    name: 'isCandidatePath keeps an ordinary ES5 built-in test',
    run: () => {
      const policy = parseEs5Selection(policyText());

      assertSame(
        isKnownGoodCandidate(
          'test/built-ins/Array/prototype/push/S15.4.4.7_A1.js',
          CANDIDATE_INFO,
          policy,
        ),
        true,
      );
    },
  },
  {
    name: 'isCandidatePath preserves a known-good untagged test that the engine grammar accepts',
    run: () => {
      const policy = parseEs5Selection(policyText());
      const path =
        'test/built-ins/Array/prototype/reverse/array-has-one-entry.js';
      const engineCandidate = {
        declaresFeatures: false,
        features: Object.freeze([]),
        isModule: false,
        parsesUnderEngineGrammar: true,
        includesParseUnderEngineGrammar: true,
      };

      assertSame(
        isKnownGoodCandidate(path, engineCandidate, policy),
        true,
        'an untagged test must remain selected when the engine parser accepts it',
      );
    },
  },
  {
    name: 'the selection policy records the exact issue #25 expansion feature boundary',
    run: () => {
      const policy = parseEs5Selection(policyText());

      assertSame(
        JSON.stringify(policy.expansionFeatures),
        JSON.stringify(ES2015_SYNTAX_FEATURES),
        'the issue #25 expansion boundary must be an exact sorted policy list',
      );
    },
  },
  {
    name: 'a nonbaseline untagged candidate is rejected while a known-good untagged path remains selected',
    run: () => {
      const policy = parseEs5Selection(policyText());
      const path =
        'test/built-ins/Array/prototype/reverse/array-has-one-entry.js';

      assertSame(
        isCandidatePath(path, CANDIDATE_INFO, policy, new Set()),
        false,
        'a newly parseable untagged path must not expand the known-good selection',
      );
      assertSame(
        isCandidatePath(path, CANDIDATE_INFO, policy, new Set([path])),
        true,
        'a known-good untagged path must remain selected',
      );
    },
  },
  {
    name: 'a nonbaseline Symbol.species Test262 case remains rejected without an expansion tag',
    run: () => {
      const policy = parseEs5Selection(
        policyText({
          builtins: ['Array', 'Object', 'String', 'Symbol'],
          featureAreas: [
            {
              prefix: 'test/built-ins/Symbol',
              features: ['Symbol.species'],
              reason: 'The legacy Symbol feature area claims this tag.',
            },
          ],
        }),
      );

      assertSame(
        isCandidatePath(
          'test/built-ins/Symbol/species/subclassing.js',
          {
            ...CANDIDATE_INFO,
            declaresFeatures: true,
            features: ['Symbol.species'],
          },
          policy,
          new Set(),
        ),
        false,
        'a feature area alone must not admit the pinned Symbol.species subclassing test',
      );
    },
  },
  {
    name: 'a nonbaseline issue #25-tagged candidate is admitted by its exact feature area',
    run: () => {
      const policy = parseEs5Selection(es2015SyntaxPolicyText());

      assertSame(
        isCandidatePath(
          'test/language/expressions/class/method/strict.js',
          {
            ...CANDIDATE_INFO,
            declaresFeatures: true,
            features: ['class'],
          },
          policy,
          new Set(),
        ),
        true,
        'an issue #25 tag claimed by the matching feature area must expand the subset',
      );
    },
  },
  {
    name: 'isCandidatePath drops excluded top-level directories',
    run: () => {
      const policy = parseEs5Selection(policyText());

      assertSame(
        isCandidatePath('test/intl402/Number/x.js', CANDIDATE_INFO, policy),
        false,
      );
      assertSame(
        isCandidatePath('test/staging/x.js', CANDIDATE_INFO, policy),
        false,
      );
    },
  },
  {
    name: 'isCandidatePath drops non-allowlisted built-ins and excluded language dirs',
    run: () => {
      const policy = parseEs5Selection(policyText());

      assertSame(
        isCandidatePath('test/built-ins/Map/x.js', CANDIDATE_INFO, policy),
        false,
      );
      assertSame(
        isCandidatePath('test/language/export/x.js', CANDIDATE_INFO, policy),
        false,
      );
      assertSame(
        isKnownGoodCandidate(
          'test/language/expressions/addition/x.js',
          CANDIDATE_INFO,
          policy,
        ),
        true,
      );
    },
  },
  {
    name: 'isCandidatePath drops feature-tagged, module, unparsable, and bad-include files',
    run: () => {
      const policy = parseEs5Selection(policyText());
      const path = 'test/built-ins/Array/x.js';

      assertSame(
        isCandidatePath(
          path,
          { ...CANDIDATE_INFO, declaresFeatures: true, features: ['Symbol'] },
          policy,
        ),
        false,
      );
      assertSame(
        isCandidatePath(path, { ...CANDIDATE_INFO, isModule: true }, policy),
        false,
      );
      assertSame(
        isCandidatePath(
          path,
          { ...CANDIDATE_INFO, parsesUnderEngineGrammar: false },
          policy,
        ),
        false,
      );
      assertSame(
        isCandidatePath(
          path,
          { ...CANDIDATE_INFO, includesParseUnderEngineGrammar: false },
          policy,
        ),
        false,
      );
    },
  },
  {
    name: 'a feature area admits a tagged test whose every tag it claims',
    run: () => {
      const policy = parseEs5Selection(featureAreaPolicyText());

      assertSame(
        isKnownGoodCandidate(
          'test/built-ins/Symbol/symbol.js',
          { ...CANDIDATE_INFO, declaresFeatures: true, features: ['Symbol'] },
          policy,
        ),
        true,
      );
      assertSame(
        isKnownGoodCandidate(
          'test/built-ins/Symbol/iterator/prop-desc.js',
          {
            ...CANDIDATE_INFO,
            declaresFeatures: true,
            features: ['Symbol.iterator', 'Symbol'],
          },
          policy,
        ),
        true,
      );
    },
  },
  {
    name: 'a feature area rejects a tag it does not claim, even inside its prefix',
    run: () => {
      const policy = parseEs5Selection(featureAreaPolicyText());

      assertSame(
        isCandidatePath(
          'test/built-ins/Symbol/iterator/cross-realm.js',
          {
            ...CANDIDATE_INFO,
            declaresFeatures: true,
            features: ['cross-realm', 'Symbol.iterator'],
          },
          policy,
        ),
        false,
      );
      assertSame(
        isCandidatePath(
          'test/built-ins/Symbol/matchAll/prop-desc.js',
          {
            ...CANDIDATE_INFO,
            declaresFeatures: true,
            features: ['Symbol.matchAll'],
          },
          policy,
        ),
        false,
      );
    },
  },
  {
    name: 'a claimed feature unlocks nothing outside the area that claims it',
    run: () => {
      const policy = parseEs5Selection(featureAreaPolicyText());

      assertSame(
        isCandidatePath(
          'test/built-ins/Array/prototype/concat/Symbol.isConcatSpreadable.js',
          { ...CANDIDATE_INFO, declaresFeatures: true, features: ['Symbol'] },
          policy,
        ),
        false,
      );
      // The prefix must match on a directory boundary, exactly like an
      // exclusion prefix, so a sibling directory is never swallowed.
      assertSame(
        isCandidatePath(
          'test/built-ins/SymbolOther/x.js',
          { ...CANDIDATE_INFO, declaresFeatures: true, features: ['Symbol'] },
          policy,
        ),
        false,
      );
    },
  },
  {
    name: 'a feature area never rescues a module, an unparsable file, or a block-style tag',
    run: () => {
      const policy = parseEs5Selection(featureAreaPolicyText());
      const path = 'test/built-ins/Symbol/symbol.js';
      const tagged = {
        ...CANDIDATE_INFO,
        declaresFeatures: true,
        features: ['Symbol'],
      };

      assertSame(
        isCandidatePath(path, { ...tagged, isModule: true }, policy),
        false,
      );
      assertSame(
        isCandidatePath(
          path,
          { ...tagged, parsesUnderEngineGrammar: false },
          policy,
        ),
        false,
      );
      assertSame(
        isCandidatePath(path, { ...tagged, features: [] }, policy),
        false,
      );
    },
  },
  {
    name: 'a feature area still retains a known-good untagged test',
    run: () => {
      const policy = parseEs5Selection(featureAreaPolicyText());

      assertSame(
        isKnownGoodCandidate(
          'test/built-ins/Array/prototype/push/S15.4.4.7_A1.js',
          CANDIDATE_INFO,
          policy,
        ),
        true,
      );
    },
  },
  {
    name: 'a feature area cannot be hidden by an exclusion with the same prefix',
    run: () => {
      const prefix = 'test/built-ins/Array/prototype/values';
      const path = `${prefix}/returns-iterator.js`;
      const featureAreas = [
        {
          prefix,
          features: ['Symbol.iterator'],
          reason: 'ES2015 Array iterators are implemented.',
        },
      ];
      const policy = parseEs5Selection(policyText({ featureAreas }));
      const info = {
        ...CANDIDATE_INFO,
        declaresFeatures: true,
        features: ['Symbol.iterator'],
      };

      assertSame(isKnownGoodCandidate(path, info, policy), true);
      const error = assertThrows(
        () =>
          parseEs5Selection(
            policyText({
              featureAreas,
              exclusions: [
                {
                  prefix,
                  category: 'post-es5-builtin',
                  reason:
                    'Obsolete ES5-only exclusion for Array.prototype.values.',
                },
              ],
            }),
          ),
        Es5SelectionError,
      );
      assertSame(
        error.message.includes(prefix),
        true,
        `${path} with feature tag Symbol.iterator must be included because Array.prototype.values is implemented, not excluded as post-es5-builtin`,
      );
    },
  },
  {
    name: 'the Proxy-dependent for-of fixture needs an exact classified exclusion',
    run: () => {
      const path =
        'test/language/statements/for-of/iterator-next-result-type.js';
      const feature = 'Symbol.iterator';
      const reason =
        'The test constructs a `Proxy` to observe IteratorValue ordering but declares only `Symbol.iterator`; `Proxy` is an ES2015 built-in this runtime foundation does not implement, so the otherwise-supported tag is insufficient to run it.';
      const featureAreas = [
        {
          prefix: 'test/language',
          features: [feature],
          reason: 'ES2015 Symbol.iterator language tests are implemented.',
        },
      ];
      const info = {
        ...CANDIDATE_INFO,
        declaresFeatures: true,
        features: [feature],
      };
      const policyWithoutExclusion = parseEs5Selection(
        policyText({ featureAreas }),
      );

      assertSame(
        isKnownGoodCandidate(path, info, policyWithoutExclusion),
        true,
        `${path} declares only ${feature} and is included by the feature area before its unsupported Proxy dependency is classified`,
      );

      const policy = parseEs5Selection(
        policyText({
          featureAreas,
          exclusions: [
            {
              path,
              category: 'post-es5-builtin',
              reason,
            },
          ],
        }),
      );
      const exclusion = matchExclusion(path, policy.exclusions);

      assertSame(
        isSelectedPath(path, info, policy, new Set([path])),
        false,
        `${path} declares only ${feature} and would be included by the feature area, but must be excluded as post-es5-builtin because it constructs unsupported Proxy`,
      );
      assertSame(
        exclusion?.category,
        'post-es5-builtin',
        `${path} must use the unsupported Proxy builtin exclusion category`,
      );
      assertSame(
        exclusion?.reason,
        reason,
        `${path} must record unsupported Proxy as its exact exclusion reason`,
      );
    },
  },
  {
    name: 'parseEs5Selection rejects every malformed feature area',
    run: () => {
      /** @type {[string, object[]][]} */
      const malformed = [
        ['unknown key', [{ prefix: 'test/x', features: ['A'], why: 'no' }]],
        ['missing reason', [{ prefix: 'test/x', features: ['A'] }]],
        ['empty reason', [{ prefix: 'test/x', features: ['A'], reason: ' ' }]],
        ['missing prefix', [{ features: ['A'], reason: 'r' }]],
        [
          'prefix outside test/',
          [{ prefix: 'x', features: ['A'], reason: 'r' }],
        ],
        ['no features', [{ prefix: 'test/x', features: [], reason: 'r' }]],
        [
          'unsorted features',
          [{ prefix: 'test/x', features: ['B', 'A'], reason: 'r' }],
        ],
        [
          'duplicate features',
          [{ prefix: 'test/x', features: ['A', 'A'], reason: 'r' }],
        ],
        [
          'unsorted areas',
          [
            { prefix: 'test/y', features: ['A'], reason: 'r' },
            { prefix: 'test/x', features: ['A'], reason: 'r' },
          ],
        ],
        [
          'duplicate areas',
          [
            { prefix: 'test/x', features: ['A'], reason: 'r' },
            { prefix: 'test/x', features: ['B'], reason: 'r' },
          ],
        ],
      ];

      for (const [label, featureAreas] of malformed) {
        assertThrows(
          () => parseEs5Selection(policyText({ featureAreas })),
          Es5SelectionError,
        );
        assertSame(typeof label, 'string');
      }
    },
  },
  {
    name: 'matchExclusion matches an exact path and a prefix on a directory boundary',
    run: () => {
      const policy = parseEs5Selection(
        policyText({
          exclusions: [
            {
              prefix: 'test/built-ins/Array/from',
              category: 'post-es5-builtin',
              reason: 'ES2015 Array.from',
            },
            {
              path: 'test/built-ins/Array/of/length.js',
              category: 'post-es5-builtin',
              reason: 'ES2015 Array.of',
            },
          ],
        }),
      );

      assertSame(
        matchExclusion('test/built-ins/Array/of/length.js', policy.exclusions)
          ?.category,
        'post-es5-builtin',
      );
      assertSame(
        matchExclusion('test/built-ins/Array/from/name.js', policy.exclusions)
          ?.category,
        'post-es5-builtin',
      );
      // A sibling directory that merely shares a name prefix must not match.
      assertSame(
        matchExclusion(
          'test/built-ins/Array/fromAsync/x.js',
          policy.exclusions,
        ),
        null,
      );
      assertSame(
        matchExclusion('test/built-ins/Array/of/name.js', policy.exclusions),
        null,
      );
    },
  },
  {
    name: 'deriveGroupName groups by the first two directory segments',
    run: () => {
      assertSame(
        deriveGroupName('test/built-ins/Array/from/x.js'),
        'built-ins/Array',
      );
      assertSame(
        deriveGroupName('test/language/expressions/addition/x.js'),
        'language/expressions',
      );
      assertSame(
        deriveGroupName('test/annexB/built-ins/escape/x.js'),
        'annexB/built-ins',
      );
      assertSame(deriveGroupName('test/harness/sta.js'), 'harness');
    },
  },
  {
    name: 'buildUpstreamSubset groups and sorts deterministically and validates',
    run: () => {
      const subset = buildUpstreamSubset({
        repository: 'https://github.com/tc39/test262.git',
        revision: '0'.repeat(40),
        paths: [
          'test/built-ins/Array/prototype/push/b.js',
          'test/built-ins/Array/prototype/push/a.js',
          'test/language/expressions/addition/x.js',
          'test/harness/sta.js',
        ],
      });

      assertSame(
        JSON.stringify(subset.groups.map((g) => g.name)),
        JSON.stringify(['built-ins/Array', 'harness', 'language/expressions']),
      );
      const arrayGroup = subset.groups.find(
        (g) => g.name === 'built-ins/Array',
      );
      assertSame(
        JSON.stringify(arrayGroup?.paths),
        JSON.stringify([
          'test/built-ins/Array/prototype/push/a.js',
          'test/built-ins/Array/prototype/push/b.js',
        ]),
      );
      assertSame(typeof arrayGroup?.summary, 'string');
      assertSame((arrayGroup?.summary.length ?? 0) > 0, true);

      // The serialized subset must satisfy the existing upstream schema.
      const text = serializeUpstreamSubset(subset);
      assertSame(text.endsWith('\n'), true);
      const reparsed = parseUpstreamSubset(text);
      assertSame(reparsed.groups.length, 3);
    },
  },
  {
    name: 'serializeUpstreamSubset is stable across repeated builds',
    run: () => {
      const options = {
        repository: 'https://github.com/tc39/test262.git',
        revision: '0'.repeat(40),
        paths: [
          'test/built-ins/Object/keys/x.js',
          'test/built-ins/Array/isArray/x.js',
        ],
      };

      assertSame(
        serializeUpstreamSubset(buildUpstreamSubset(options)),
        serializeUpstreamSubset(buildUpstreamSubset(options)),
      );
    },
  },
  {
    // The committed manifest is both regenerated (test262:select:check owns its
    // bytes) and format-checked (it is a tracked tools/**/*.json). Those two
    // contracts only stay compatible if the generator emits exactly what
    // Prettier would: a path array is inlined when its flat form fits the
    // 80-column print width, and expanded one-per-line otherwise.
    name: 'serializeUpstreamSubset inlines path arrays that fit the print width and expands the rest',
    run: () => {
      const repository = 'https://github.com/tc39/test262.git';
      const revision = '0'.repeat(40);

      const shortText = serializeUpstreamSubset(
        buildUpstreamSubset({
          repository,
          revision,
          paths: ['test/language/punctuators/S7.7_A1.js'],
        }),
      );
      assertSame(
        shortText.includes(
          '      "paths": ["test/language/punctuators/S7.7_A1.js"]\n',
        ),
        true,
      );
      assertSame(shortText.includes('"paths": [\n'), false);

      const longPaths = [
        'test/built-ins/Array/prototype/reduce/15.4.4.21-9-c-ii-4-s.js',
        'test/built-ins/Array/prototype/reduce/15.4.4.21-9-c-ii-4-y.js',
      ];
      const longText = serializeUpstreamSubset(
        buildUpstreamSubset({ repository, revision, paths: longPaths }),
      );
      assertSame(longText.includes('"paths": [\n'), true);
      for (const path of longPaths) {
        assertSame(longText.includes(`\n        "${path}"`), true);
      }

      // Whatever the shape, no emitted line may exceed the print width, or the
      // format check would rewrite the manifest the regenerator just wrote.
      for (const line of longText.split('\n')) {
        assertSame(line.length <= 80, true);
      }
    },
  },
];
