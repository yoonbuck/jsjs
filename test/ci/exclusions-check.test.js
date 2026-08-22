/**
 * Tests for the stale-exclusion check logic.
 *
 * This suite lives behind the CI-contract entry point (`test/run-ci-contract.js`)
 * because it requires an upstream Test262 checkout at `vendor/test262`. The same
 * guarantee is enforced in CI by `npm run test262:exclusions:check` in the
 * `test262-upstream` job. It exercises the integration path: the real policy
 * file, a real checkout, and the real engine, confirming that the runner
 * correctly identifies passing and failing tests.
 */

import { readFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import {
  checkExclusions,
  evaluateExclusionGate,
  parseUnverifiableAllowlist,
  EXCLUSIONS_UNVERIFIABLE_FILE,
} from '../../tools/test262/exclusions-check.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import { runTest262File } from '../../tools/test262/runner.js';
import { readTest262Pin } from '../../tools/test262/upstream-run.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
} from '../../tools/test262/features.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const STRICT_HARNESS_EXCLUSION_PATHS = Object.freeze([
  'test/staging/sm/strict/10.4.2.js',
  'test/staging/sm/strict/10.6.js',
  'test/staging/sm/strict/11.1.5.js',
  'test/staging/sm/strict/11.13.1.js',
  'test/staging/sm/strict/11.13.2.js',
  'test/staging/sm/strict/11.3.1.js',
  'test/staging/sm/strict/11.3.2.js',
  'test/staging/sm/strict/11.4.1.js',
  'test/staging/sm/strict/11.4.4.js',
  'test/staging/sm/strict/11.4.5.js',
  'test/staging/sm/strict/12.10.1.js',
  'test/staging/sm/strict/12.14.1.js',
  'test/staging/sm/strict/12.2.1-01.js',
  'test/staging/sm/strict/12.2.1.js',
  'test/staging/sm/strict/13.1.js',
  'test/staging/sm/strict/15.10.7.js',
  'test/staging/sm/strict/15.3.5.1.js',
  'test/staging/sm/strict/15.3.5.2.js',
  'test/staging/sm/strict/15.4.4.11.js',
  'test/staging/sm/strict/15.4.4.12.js',
  'test/staging/sm/strict/15.4.4.13.js',
  'test/staging/sm/strict/15.4.4.6.js',
  'test/staging/sm/strict/15.4.4.8.js',
  'test/staging/sm/strict/15.4.4.9.js',
  'test/staging/sm/strict/15.5.5.1.js',
  'test/staging/sm/strict/15.5.5.2.js',
  'test/staging/sm/strict/8.12.5.js',
  'test/staging/sm/strict/8.12.7-2.js',
  'test/staging/sm/strict/8.12.7.js',
  'test/staging/sm/strict/8.7.2.js',
  'test/staging/sm/strict/B.1.1.js',
  'test/staging/sm/strict/B.1.2.js',
  'test/staging/sm/strict/eval-variable-environment.js',
  'test/staging/sm/strict/regress-532254.js',
  'test/staging/sm/strict/strict-function-statements.js',
]);

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<Error>}
 */
async function rejectionFrom(promise) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`Expected an Error rejection, got ${typeof error}`);
  }

  throw new Error('Expected promise to reject');
}

export default [
  {
    name: 'checkExclusions rejects a missing pinned checkout with setup commands',
    run: async () => {
      const pin = await readTest262Pin();
      const missingCheckout = 'vendor/missing-test262-checkout';
      const error = await rejectionFrom(
        checkExclusions({
          pin: { ...pin, checkoutPath: missingCheckout },
          supportedFeatures: [],
        }),
      );

      assertSame(
        error.message.includes(
          `${missingCheckout} is not a git checkout.\nCheck the pinned upstream tree out first:`,
        ),
        true,
      );
      assertSame(
        error.message.includes(
          `git clone --filter=blob:none ${pin.repository} ${missingCheckout}`,
        ),
        true,
      );
      assertSame(
        error.message.includes(
          `git -C ${missingCheckout} checkout ${pin.revision}`,
        ),
        true,
      );
    },
  },
  {
    name: 'checkExclusions rejects a policy path missing from the pinned checkout',
    run: async () => {
      const pin = await readTest262Pin();
      const selectionText = await readRepositoryFile(
        'test/fixtures/test262-exclusions/missing-path.json',
      );
      const error = await rejectionFrom(
        checkExclusions({
          pin,
          selectionText,
          supportedFeatures: [],
        }),
      );

      assertSame(
        error.message.includes(
          'test/built-ins/Array/missing-exclusion-fixture.js',
        ),
        true,
      );
      assertSame(error.message.includes(pin.checkoutPath), true);
      assertSame(
        error.message.includes('Update tools/test262/es5-selection.json'),
        true,
      );
    },
  },
  {
    name: 'checkExclusions executes module exclusions with the complete engine bridge',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );
      const selectionText = await readRepositoryFile(
        'test/fixtures/test262-exclusions/module-pass.json',
      );
      const file = 'test/staging/sm/module/await-restricted-nested.js';
      const directRecords = await runTest262File({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        file,
        supportedFeatures,
      });

      assertSame(directRecords.length, 1);
      assertSame(directRecords[0].status, 'passed');

      const results = await checkExclusions({
        pin,
        selectionText,
        supportedFeatures,
      });

      assertSame(results.length, 1);
      assertSame(results[0].path, file);
      assertSame(results[0].verdict, 'passed');
    },
  },
  {
    name: 'checkExclusions treats infrastructure failures as unverifiable, not exclusion evidence',
    run: async () => {
      const pin = await readTest262Pin();
      const selectionText = await readRepositoryFile(
        'test/fixtures/test262-exclusions/module-pass.json',
      );

      for (const reason of [
        'engine-error',
        'load-error',
        'metadata-error',
        'harness-error',
      ]) {
        const results = await checkExclusions({
          pin,
          selectionText,
          supportedFeatures: [],
          runFile: async () => [
            {
              type: 'test',
              file: 'test/staging/sm/module/await-restricted-nested.js',
              variant: 'non-strict',
              status: 'failed',
              reason,
              message: `${reason} detail`,
            },
          ],
        });

        assertSame(results[0].verdict, 'unverifiable');
        assertSame(results[0].message?.includes(reason), true);
        assertSame(results[0].message?.includes(`${reason} detail`), true);
      }

      const semanticFailure = await checkExclusions({
        pin,
        selectionText,
        supportedFeatures: [],
        runFile: async () => [
          {
            type: 'test',
            file: 'test/staging/sm/module/await-restricted-nested.js',
            variant: 'non-strict',
            status: 'failed',
            reason: 'wrong-error-type',
            message: 'expected SyntaxError, got TypeError',
          },
        ],
      });

      assertSame(semanticFailure[0].verdict, 'failed');
      assertSame(
        semanticFailure[0].message,
        'non-strict: wrong-error-type: expected SyntaxError, got TypeError',
      );
    },
  },
  {
    name: 'the exclusion gate retains passing host-dependent exclusions',
    run: () => {
      const gate = evaluateExclusionGate(
        [
          {
            path: 'test/host-dependent.js',
            category: 'host-dependent',
            verdict: 'passed',
          },
        ],
        [],
      );

      assertSame(gate.exitCode, 0);
      assertSame(
        JSON.stringify(gate.correctlyExcluded),
        JSON.stringify([
          {
            path: 'test/host-dependent.js',
            category: 'host-dependent',
            verdict: 'passed',
          },
        ]),
      );
      assertSame(gate.staleExclusions.length, 0);
      assertSame(gate.staleApprovals.length, 0);
    },
  },
  {
    name: 'the exclusion gate rejects passing exclusions in every non-host-dependent category',
    run: () => {
      /** @type {Parameters<typeof evaluateExclusionGate>[0]} */
      const results = [
        {
          path: 'test/post-es5-semantics.js',
          category: 'post-es5-semantics',
          verdict: 'passed',
        },
        {
          path: 'test/post-es5-builtin.js',
          category: 'post-es5-builtin',
          verdict: 'passed',
        },
        {
          path: 'test/post-es5-syntax.js',
          category: 'post-es5-syntax',
          verdict: 'passed',
        },
        {
          path: 'test/engine-deviation.js',
          category: 'engine-deviation',
          verdict: 'passed',
        },
      ];
      const approvals = [
        {
          path: 'test/unused-b.js',
          diagnostics: ['unflagged: harness-error: unused b'],
          reason: 'Second unused approval.',
        },
        {
          path: 'test/unused-a.js',
          diagnostics: ['unflagged: harness-error: unused a'],
          reason: 'First unused approval.',
        },
      ];
      const gate = evaluateExclusionGate(results, approvals);

      assertSame(gate.exitCode, 1);
      assertSame(gate.correctlyExcluded.length, 0);
      assertSame(JSON.stringify(gate.staleExclusions), JSON.stringify(results));
      assertSame(
        JSON.stringify(gate.staleApprovals),
        JSON.stringify(approvals),
      );
    },
  },
  {
    name: 'the exclusion gate rejects stale, unapproved, mismatched, and unused approvals',
    run: () => {
      assertSame(typeof evaluateExclusionGate, 'function');

      const approvedDiagnostics = [
        'non-strict: harness-error: known harness dependency',
        'strict: harness-error: known harness dependency',
      ];
      const approvals = [
        {
          path: 'test/approved.js',
          diagnostics: approvedDiagnostics,
          reason: 'Requires an unsupported harness dependency.',
        },
        {
          path: 'test/unused.js',
          diagnostics: ['unflagged: harness-error: unused diagnostic'],
          reason: 'This approval should become stale.',
        },
      ];
      const blocked = evaluateExclusionGate(
        [
          {
            path: 'test/semantic.js',
            category: 'runtime',
            verdict: 'failed',
          },
          {
            path: 'test/stale.js',
            category: 'runtime',
            verdict: 'passed',
          },
          {
            path: 'test/approved.js',
            category: 'runtime',
            verdict: 'unverifiable',
            message: approvedDiagnostics.join('; '),
            diagnostics: approvedDiagnostics,
          },
          {
            path: 'test/unapproved.js',
            category: 'runtime',
            verdict: 'unverifiable',
            message: 'engine-error: new infrastructure failure',
          },
        ],
        approvals,
      );

      assertSame(blocked.exitCode, 1);
      assertSame(blocked.staleExclusions.length, 1);
      assertSame(blocked.approvedUnverifiable.length, 1);
      assertSame(blocked.unapprovedUnverifiable.length, 1);
      assertSame(blocked.staleApprovals.length, 1);
      assertSame(blocked.staleApprovals[0].path, 'test/unused.js');

      const clean = evaluateExclusionGate(
        [
          {
            path: 'test/semantic.js',
            category: 'runtime',
            verdict: 'failed',
          },
          {
            path: 'test/approved.js',
            category: 'runtime',
            verdict: 'unverifiable',
            message: approvedDiagnostics.join('; '),
            diagnostics: approvedDiagnostics,
          },
        ],
        approvals.slice(0, 1),
      );

      assertSame(clean.exitCode, 0);
      assertSame(clean.approvedUnverifiable.length, 1);
      assertSame(clean.unapprovedUnverifiable.length, 0);
      assertSame(clean.staleExclusions.length, 0);
      assertSame(clean.staleApprovals.length, 0);
    },
  },
  {
    name: 'approvals reject diagnostic prefix, suffix, reason, variant, message, order, and count drift',
    run: () => {
      const approval = {
        path: 'test/approved.js',
        diagnostics: [
          'non-strict: harness-error: known harness dependency',
          'strict: harness-error: known harness dependency',
        ],
        reason: 'Requires an unsupported harness dependency.',
      };
      const driftedDiagnostics = [
        [
          'prefix: non-strict: harness-error: known harness dependency',
          'strict: harness-error: known harness dependency',
        ],
        [
          'non-strict: harness-error: known harness dependency: suffix',
          'strict: harness-error: known harness dependency',
        ],
        [
          'non-strict: engine-error: known harness dependency',
          'strict: harness-error: known harness dependency',
        ],
        [
          'raw: harness-error: known harness dependency',
          'strict: harness-error: known harness dependency',
        ],
        [
          'non-strict: harness-error: changed harness dependency',
          'strict: harness-error: known harness dependency',
        ],
        [
          'strict: harness-error: known harness dependency',
          'non-strict: harness-error: known harness dependency',
        ],
        [
          'non-strict: harness-error: known harness dependency',
          'strict: harness-error: known harness dependency',
          'raw: harness-error: known harness dependency',
        ],
      ];

      for (const diagnostics of driftedDiagnostics) {
        const gate = evaluateExclusionGate(
          [
            {
              path: 'test/approved.js',
              category: 'runtime',
              verdict: 'unverifiable',
              message: diagnostics.join('; '),
              diagnostics,
            },
          ],
          [approval],
        );

        assertSame(gate.exitCode, 1);
        assertSame(gate.approvedUnverifiable.length, 0);
        assertSame(gate.unapprovedUnverifiable.length, 1);
        assertSame(gate.staleApprovals.length, 1);
      }
    },
  },
  {
    name: 'the unverifiable approval manifest requires exact reviewed records',
    run: () => {
      assertSame(typeof parseUnverifiableAllowlist, 'function');

      const parsed = parseUnverifiableAllowlist(
        JSON.stringify({
          schemaVersion: 2,
          entries: [
            {
              path: 'test/approved.js',
              diagnostics: [
                'non-strict: harness-error: known diagnostic',
                'strict: harness-error: known diagnostic',
              ],
              reason: 'Reviewed dependency is unavailable.',
            },
          ],
        }),
      );

      assertSame(parsed.length, 1);
      assertSame(parsed[0].path, 'test/approved.js');
      assertSame(Object.isFrozen(parsed), true);
      assertSame(Object.isFrozen(parsed[0]), true);
      assertSame(Object.isFrozen(parsed[0].diagnostics), true);
      assertSame(parsed[0].diagnostics.length, 2);

      const duplicate = assertThrows(
        () =>
          parseUnverifiableAllowlist(
            JSON.stringify({
              schemaVersion: 2,
              entries: [
                {
                  path: 'test/approved.js',
                  diagnostics: ['non-strict: harness-error: known diagnostic'],
                  reason: 'First review.',
                },
                {
                  path: 'test/approved.js',
                  diagnostics: ['non-strict: harness-error: known diagnostic'],
                  reason: 'Duplicate review.',
                },
              ],
            }),
          ),
        Error,
      );

      assertSame(
        duplicate.message.includes('duplicate path: test/approved.js'),
        true,
      );

      for (const diagnostics of [[], [''], 'known diagnostic']) {
        const invalidDiagnostics = assertThrows(
          () =>
            parseUnverifiableAllowlist(
              JSON.stringify({
                schemaVersion: 2,
                entries: [
                  {
                    path: 'test/approved.js',
                    diagnostics,
                    reason: 'Reviewed dependency is unavailable.',
                  },
                ],
              }),
            ),
          Error,
        );

        assertSame(
          invalidDiagnostics.message.includes(
            'entries[0].diagnostics must be a non-empty array of non-empty strings',
          ),
          true,
        );
      }

      const legacyFragment = assertThrows(
        () =>
          parseUnverifiableAllowlist(
            JSON.stringify({
              schemaVersion: 2,
              entries: [
                {
                  path: 'test/approved.js',
                  diagnosticIncludes: 'known diagnostic',
                  reason: 'Reviewed dependency is unavailable.',
                },
              ],
            }),
          ),
        Error,
      );

      assertSame(
        legacyFragment.message.includes(
          'must contain exactly: diagnostics, path, reason',
        ),
        true,
      );
    },
  },
  {
    name: 'the strict-shell compatibility bridge verifies every exact affected exclusion path',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );
      const host = createNodeTest262Host({ root: pin.checkoutPath });
      const engine = createJsjsTest262Engine();

      for (const file of STRICT_HARNESS_EXCLUSION_PATHS) {
        const records = await runTest262File({
          engine,
          host,
          file,
          supportedFeatures,
        });

        assertSame(records.length > 0, true, file);
        assertSame(
          records.some(
            (record) =>
              record.reason === 'harness-error' &&
              record.message?.includes('globalThis is not defined'),
          ),
          false,
          file,
        );
      }
    },
  },
  {
    name: 'the strict-shell bridge stays scoped to harness source',
    run: async () => {
      const pin = await readTest262Pin();
      const upstreamHost = createNodeTest262Host({ root: pin.checkoutPath });
      const file = 'test/staging/jsjs/strict-shell-global-scope.js';
      const host = {
        ...upstreamHost,
        readTest(/** @type {string} */ path) {
          if (path !== file) {
            return upstreamHost.readTest(path);
          }

          return [
            '/*---',
            'description: strict shell uses its global parameter without exposing globalThis',
            'flags: [noStrict]',
            'includes: [sm/non262-strict-shell.js]',
            '---*/',
            'assert.sameValue(typeof completesNormally, "function");',
            'assert.sameValue(typeof globalThis, "undefined");',
          ].join('\n');
        },
      };
      const records = await runTest262File({
        engine: createJsjsTest262Engine(),
        host,
        file,
        supportedFeatures: [],
      });

      assertSame(records.length, 1);
      assertSame(records[0].status, 'passed', records[0].message);
    },
  },
  {
    name: 'the exact indented-frontmatter exclusion reaches semantic execution',
    run: async () => {
      const pin = await readTest262Pin();
      const file = 'test/language/statements/function/13.2-30-s.js';
      const records = await runTest262File({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        file,
        supportedFeatures: [],
      });

      assertSame(records.length > 0, true);
      assertSame(
        records.some((record) => record.reason === 'metadata-error'),
        false,
        file,
      );
    },
  },
  {
    name: 'checkExclusions retains every mixed failure diagnostic when infrastructure is unverifiable',
    run: async () => {
      const pin = await readTest262Pin();
      const selectionText = await readRepositoryFile(
        'test/fixtures/test262-exclusions/module-pass.json',
      );
      const results = await checkExclusions({
        pin,
        selectionText,
        supportedFeatures: [],
        runFile: async () => [
          {
            type: 'test',
            file: 'test/staging/sm/module/await-restricted-nested.js',
            variant: 'non-strict',
            status: 'failed',
            reason: 'engine-error',
            message: 'engine bridge unavailable',
          },
          {
            type: 'test',
            file: 'test/staging/sm/module/await-restricted-nested.js',
            variant: 'strict',
            status: 'failed',
            reason: 'wrong-error-type',
            message: 'expected SyntaxError, got TypeError',
          },
          {
            type: 'test',
            file: 'test/staging/sm/module/await-restricted-nested.js',
            variant: 'raw',
            status: 'passed',
          },
        ],
      });

      assertSame(results[0].verdict, 'unverifiable');
      assertSame(
        results[0].message,
        'non-strict: engine-error: engine bridge unavailable; strict: wrong-error-type: expected SyntaxError, got TypeError',
      );
    },
  },
  {
    name: 'checkExclusions retains passing host-dependent exclusions in the committed policy',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );

      const results = await checkExclusions({
        pin,
        supportedFeatures,
      });

      const passing = results.filter((result) => result.verdict === 'passed');
      const gate = evaluateExclusionGate(
        results,
        parseUnverifiableAllowlist(
          await readRepositoryFile(EXCLUSIONS_UNVERIFIABLE_FILE),
        ),
      );

      assertSame(passing.length, 18);
      assertSame(
        passing.every((result) => result.category === 'host-dependent'),
        true,
        `Expected only host-dependent exclusions to pass, found: ${passing
          .filter((result) => result.category !== 'host-dependent')
          .map((result) => `${result.path} [${result.category}]`)
          .join(', ')}`,
      );
      assertSame(gate.staleExclusions.length, 0);
      assertSame(gate.exitCode, 0);
    },
  },
  {
    name: 'checkExclusions classifies results into passed, failed, and unverifiable',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );

      const results = await checkExclusions({
        pin,
        supportedFeatures,
      });

      const gate = evaluateExclusionGate(
        results,
        parseUnverifiableAllowlist(
          await readRepositoryFile(EXCLUSIONS_UNVERIFIABLE_FILE),
        ),
      );

      assertSame(results.length, 537);
      assertSame(gate.correctlyExcluded.length, 523);
      assertSame(gate.approvedUnverifiable.length, 14);
      assertSame(gate.unapprovedUnverifiable.length, 0);
      assertSame(gate.staleExclusions.length, 0);
      assertSame(gate.staleApprovals.length, 0);
      assertSame(gate.exitCode, 0);

      // Unsupported flags and infrastructure failures remain unverifiable.
      assertSame(
        results.every(
          (r) =>
            r.verdict === 'passed' ||
            r.verdict === 'failed' ||
            r.verdict === 'unverifiable',
        ),
        true,
        'every result must have a valid verdict',
      );

      // Every result has a path and category
      assertSame(
        results.every((r) => typeof r.path === 'string' && r.path.length > 0),
        true,
        'every result must have a path',
      );
      assertSame(
        results.every(
          (r) => typeof r.category === 'string' && r.category.length > 0,
        ),
        true,
        'every result must have a category',
      );
    },
  },
];
