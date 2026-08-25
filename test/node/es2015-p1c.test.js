import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame, assertThrows } from '../harness/assert.js';
import { buildEs2015Inventory } from '../../tools/test262/es2015-taxonomy.js';
import {
  P1C_COLLATERAL_BASE_CLASSIFICATIONS,
  P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS,
  P1C_COLLATERAL_PATHS,
  P1C_CORRECTED_APPLIED_RECORD_SHA256,
} from '../../tools/test262/es2015-p1c-collateral.js';
import { parseEs2015Promotion } from '../../tools/test262/es2015-promotion.js';
import {
  canonicalRoadmapAuthoritySha256,
  roadmapAggregateProjectionSha256,
} from '../../tools/test262/es2015-provenance.js';
import {
  parseEs5Selection,
  matchExclusion,
} from '../../tools/test262/es5-selection.js';
import { readTest262Pin } from '../../tools/test262/pin.js';
import {
  parseUpstreamSubset,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT);
const P1C_CONSUMER_BASE = '968c0124cc5c3d63a19c3f926ed7857dfb3333ce';
const { structuredClone } = globalThis;
const EXPECTED_FEATURE_PROFILE_COUNTS = Object.freeze({
  '[]': 2,
  '["Symbol.iterator","destructuring-binding"]': 8,
  '["Symbol.iterator","destructuring-binding","generators"]': 1,
  '["destructuring-binding"]': 58,
  '["destructuring-binding","generators"]': 11,
  '["let"]': 1,
});
const EXPECTED_P1C_COLLATERAL_PATHS = Object.freeze([
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js',
]);
const EXPECTED_P1C_COLLATERAL_CLASSIFICATION = Object.freeze({
  variants: 2,
  partition: 'core',
  status: 'selected-passing',
  blocker: null,
  features: Object.freeze(['default-parameters', 'destructuring-binding']),
  flags: Object.freeze(['generated']),
  includes: Object.freeze([]),
  provenance: Object.freeze([
    'anchor:sec-arrow-function-definitions-runtime-semantics-evaluation',
    'feature:default-parameters',
    'feature:destructuring-binding',
  ]),
});

export default [
  {
    name: 'P1C constants and ledger parser match the reviewed catch-binding corpus',
    run: async () => {
      const {
        P1C,
        P1C_ISSUE_NUMBER,
        P1C_ISSUE_TITLE,
        P1C_PARENT_ISSUE,
        P1C_PARENT_TITLE,
        P1C_PROMOTION_GROUP,
        parseP1CLedger,
      } = await loadP1C();

      assertSame(P1C.roots, 81);
      assertSame(P1C.variants, 161);
      assertSame(
        P1C.sha256,
        'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
      );
      assertSame(P1C_ISSUE_NUMBER, 116);
      assertSame(
        P1C_ISSUE_TITLE,
        'Implement ES2015 destructuring catch parameters and catch environments',
      );
      assertSame(P1C_PARENT_ISSUE, 78);
      assertSame(
        P1C_PARENT_TITLE,
        'Complete core ES2015 early errors and declaration instantiation',
      );
      assertSame(P1C_PROMOTION_GROUP, 'es2015/p1c-catch-binding');
      assertSame(
        assertThrows(
          () => parseP1CLedger('test/b.js\ntest/a.js\n'),
          Error,
        ).message.includes('sorted unique'),
        true,
      );
      assertSame(
        assertThrows(
          () =>
            parseP1CLedger(
              'test/language/statements/try/a.js\ntest/language/expressions/a.js\n',
            ),
          Error,
        ).message.includes('sorted unique'),
        true,
      );
      assertSame(
        assertThrows(
          () =>
            parseP1CLedger(
              'test/language/statements/try/a.js\ntest/language/statements/try/a.js\n',
            ),
          Error,
        ).message.includes('sorted unique'),
        true,
      );
    },
  },
  {
    name: 'checked-in P1C ledger matches the exact blocked try-statement taxonomy',
    run: async () => {
      const { P1C, verifyP1CLedger } = await loadP1C();
      const { ledgerText, taxonomy } = await readP1CInputs();
      const paths = verifyP1CLedger(ledgerText, taxonomy);

      assertSame(paths.length, P1C.roots);
      assertSame(
        paths[0],
        'test/language/statements/try/dstr/ary-init-iter-close.js',
      );
      assertSame(
        paths[paths.length - 1],
        'test/language/statements/try/scope-catch-param-var-none.js',
      );
    },
  },
  {
    name: 'P1C collateral contract closes the exact four ES2016 roots',
    run: async () => {
      const { ledgerText } = await readP1CInputs();
      const sourcePaths = new Set(ledgerText.trimEnd().split('\n'));

      assertSame(
        JSON.stringify(P1C_COLLATERAL_PATHS),
        JSON.stringify(EXPECTED_P1C_COLLATERAL_PATHS),
      );
      assertSame(
        JSON.stringify([...P1C_COLLATERAL_PATHS].sort()),
        JSON.stringify(P1C_COLLATERAL_PATHS),
      );
      assertSame(new Set(P1C_COLLATERAL_PATHS).size, 4);
      assertSame(
        P1C_COLLATERAL_BASE_CLASSIFICATIONS.reduce(
          (total, entry) => total + entry.variants,
          0,
        ),
        8,
      );
      assertSame(
        P1C_COLLATERAL_BASE_CLASSIFICATIONS.every(
          (entry, index) =>
            JSON.stringify(entry) ===
            JSON.stringify({
              path: EXPECTED_P1C_COLLATERAL_PATHS[index],
              ...EXPECTED_P1C_COLLATERAL_CLASSIFICATION,
            }),
        ),
        true,
      );
      assertSame(
        P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS.every((entry, index) => {
          const base = P1C_COLLATERAL_BASE_CLASSIFICATIONS[index];
          const stableBase = { ...base };
          const stableBlocked = { ...entry };
          Reflect.deleteProperty(stableBase, 'status');
          Reflect.deleteProperty(stableBase, 'blocker');
          Reflect.deleteProperty(stableBlocked, 'status');
          Reflect.deleteProperty(stableBlocked, 'blocker');
          return (
            entry.status ===
              'blocked:early-errors-and-declaration-instantiation' &&
            entry.blocker === 'early-errors-and-declaration-instantiation' &&
            JSON.stringify(stableBlocked) === JSON.stringify(stableBase)
          );
        }),
        true,
      );
      assertSame(
        P1C_COLLATERAL_PATHS.some((sourcePath) => sourcePaths.has(sourcePath)),
        false,
      );
      assertSame(
        P1C_CORRECTED_APPLIED_RECORD_SHA256,
        '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa',
      );
    },
  },
  {
    name: 'P1C ledger verification rejects reviewed taxonomy drift',
    run: async () => {
      const { verifyP1CLedger } = await loadP1C();
      const { ledgerText, taxonomy } = await readP1CInputs();
      const paths = ledgerText.trimEnd().split('\n');

      assertSame(
        assertThrows(
          () => verifyP1CLedger(`${paths.slice(0, -1).join('\n')}\n`, taxonomy),
          Error,
        ).message,
        'P1C ledger does not match the reviewed 81-root SHA-256',
      );

      const wrongBlocker = /** @type {any} */ (structuredClone(taxonomy));
      const blockerEntry = findClassification(wrongBlocker, paths[0]);
      blockerEntry.blocker = null;
      blockerEntry.status = 'selected-passing';
      assertSame(
        assertThrows(() => verifyP1CLedger(ledgerText, wrongBlocker), Error)
          .message,
        `P1C BASE classification mismatch: ${paths[0]}`,
      );

      const wrongVariants = /** @type {any} */ (structuredClone(taxonomy));
      findClassification(wrongVariants, paths[0]).variants -= 1;
      assertSame(
        assertThrows(() => verifyP1CLedger(ledgerText, wrongVariants), Error)
          .message,
        'P1C taxonomy variants do not match the reviewed ledger',
      );

      const foreignPath = /** @type {any} */ (structuredClone(taxonomy));
      findClassification(foreignPath, paths[0]).path =
        'test/language/statements/try/foreign.js';
      assertSame(
        assertThrows(() => verifyP1CLedger(ledgerText, foreignPath), Error)
          .message,
        `P1C BASE classification mismatch: ${paths[0]}`,
      );
    },
  },
  {
    name: 'applied P1C execution reconstruction rejects every source and taxonomy drift',
    run: async () => {
      const p1c = await loadP1C();
      const reconstruct = p1c.reconstructAppliedP1CSourceTaxonomy;
      assertSame(typeof reconstruct, 'function');
      const [
        ledgerText,
        taxonomyText,
        baselineText,
        dispositionText,
        provenanceText,
      ] = await Promise.all(
        [
          'tools/test262/es2015-p1c-paths.txt',
          'tools/test262/es2015-taxonomy.json',
          'tools/test262/es2015-p1c-baseline.json',
          'tools/test262/es2015-p1c-disposition.json',
          'tools/test262/es2015-provenance.json',
        ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
      );
      const options = {
        taxonomyText,
        baselineText,
        dispositionText,
        provenanceText,
      };
      const BASELINE_FILE = 'tools/test262/es2015-p1c-baseline.json';
      const DISPOSITION_FILE = 'tools/test262/es2015-p1c-disposition.json';

      const source = reconstruct(options);
      assertSame(p1c.verifyP1CLedger(ledgerText, source).length, p1c.P1C.roots);
      const sourceByPath = new Map(
        source.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      assertSame(
        JSON.stringify(
          JSON.parse(baselineText).map((/** @type {any} */ entry) =>
            sourceByPath.get(entry.path),
          ),
        ),
        JSON.stringify(JSON.parse(baselineText)),
      );

      /**
       * @param {{ baseline?: string, disposition?: string, mutate?: (authority: any, manifest: any) => void }} [overrides]
       */
      const provenanceMatching = ({
        baseline = baselineText,
        disposition = dispositionText,
        mutate,
      } = {}) => {
        const manifest = JSON.parse(provenanceText);
        const authority = manifest.roadmapAuthorities.find(
          (/** @type {any} */ entry) => entry.code === 'P1C',
        );
        for (const entry of authority.evidence) {
          if (entry.path === BASELINE_FILE) entry.sha256 = sha256(baseline);
          if (entry.path === DISPOSITION_FILE) {
            entry.sha256 = sha256(disposition);
          }
        }
        if (mutate) mutate(authority, manifest);
        return `${JSON.stringify(manifest, null, 2)}\n`;
      };

      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              provenanceText: provenanceMatching({
                mutate: (authority) => {
                  authority.state = 'pending';
                },
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution requires the applied P1C authority',
      );
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              provenanceText: provenanceMatching({
                mutate: (authority) => {
                  authority.reconciliation = {};
                },
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution requires the applied P1C authority',
      );
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              provenanceText: provenanceMatching({
                mutate: (authority, manifest) => {
                  manifest.roadmapAuthorities =
                    manifest.roadmapAuthorities.filter(
                      (/** @type {any} */ entry) => entry.code !== 'P1C',
                    );
                },
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution requires the applied P1C authority',
      );

      assertSame(
        assertThrows(
          () => reconstruct({ ...options, baselineText: `${baselineText} ` }),
          Error,
        ).message,
        'Focused P1C execution evidence does not match authority',
      );
      assertSame(
        assertThrows(
          () =>
            reconstruct({ ...options, dispositionText: `${dispositionText} ` }),
          Error,
        ).message,
        'Focused P1C execution evidence does not match authority',
      );

      const shortBaseline = renderP1CJson(
        JSON.parse(baselineText).slice(0, p1c.P1C.roots - 1),
      );
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              baselineText: shortBaseline,
              provenanceText: provenanceMatching({ baseline: shortBaseline }),
            }),
          Error,
        ).message,
        'Focused P1C execution evidence has the wrong root count',
      );
      const shortDisposition = (() => {
        const disposition = JSON.parse(dispositionText);
        disposition.destinations = disposition.destinations.slice(
          0,
          p1c.P1C.roots - 1,
        );
        return renderP1CJson(disposition);
      })();
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              dispositionText: shortDisposition,
              provenanceText: provenanceMatching({
                disposition: shortDisposition,
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution evidence has the wrong root count',
      );

      const pathDriftBaseline = (() => {
        const baseline = JSON.parse(baselineText);
        baseline[0] = { ...baseline[0], path: `${baseline[0].path}#drift` };
        return renderP1CJson(baseline);
      })();
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              baselineText: pathDriftBaseline,
              provenanceText: provenanceMatching({
                baseline: pathDriftBaseline,
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution evidence has the wrong source identity',
      );
      const variantDriftBaseline = (() => {
        const baseline = JSON.parse(baselineText);
        baseline[0] = { ...baseline[0], variants: baseline[0].variants + 1 };
        return renderP1CJson(baseline);
      })();
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              baselineText: variantDriftBaseline,
              provenanceText: provenanceMatching({
                baseline: variantDriftBaseline,
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution evidence has the wrong source identity',
      );
      const destinationDriftDisposition = (() => {
        const disposition = JSON.parse(dispositionText);
        disposition.destinations[0] = {
          ...disposition.destinations[0],
          status: 'blocked:early-errors-and-declaration-instantiation',
          blocker: 'early-errors-and-declaration-instantiation',
        };
        return renderP1CJson(disposition);
      })();
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              dispositionText: destinationDriftDisposition,
              provenanceText: provenanceMatching({
                disposition: destinationDriftDisposition,
              }),
            }),
          Error,
        ).message,
        'Focused P1C execution evidence has the wrong source identity',
      );

      const sourcePath = JSON.parse(dispositionText).destinations[0].path;
      const mismatched = JSON.parse(taxonomyText);
      const mismatchedEntry = findClassification(mismatched, sourcePath);
      mismatchedEntry.status =
        'blocked:early-errors-and-declaration-instantiation';
      mismatchedEntry.blocker = 'early-errors-and-declaration-instantiation';
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              taxonomyText: renderP1CJson(mismatched),
            }),
          Error,
        ).message,
        `Focused P1C applied taxonomy mismatch: ${sourcePath}`,
      );
      const drifted = JSON.parse(taxonomyText);
      findClassification(drifted, sourcePath).provenance.push(
        'foreign-p1c-drift',
      );
      assertSame(
        assertThrows(
          () =>
            reconstruct({ ...options, taxonomyText: renderP1CJson(drifted) }),
          Error,
        ).message,
        `Focused P1C applied taxonomy drift: ${sourcePath}`,
      );
    },
  },
  {
    name: 'P1C inventory matches the pinned include closure and zero-overlap policy',
    run: async () => {
      const { verifyP1CLedger } = await loadP1C();
      const { ledgerText, taxonomy, selection, subset } = await readP1CInputs();
      const pin = await readTest262Pin(REPOSITORY_ROOT);
      const inventory = syntheticP1CInventory(ledgerText, taxonomy);
      const paths = verifyP1CLedger(ledgerText, taxonomy);
      const selected = new Set(upstreamSubsetPaths(subset));

      assertSame(taxonomy.pin.repository, pin.repository);
      assertSame(taxonomy.pin.revision, pin.revision);
      assertSame(inventory.length, 81);
      assertSame(
        inventory.reduce((sum, root) => sum + root.variants, 0),
        161,
      );
      assertSame(
        inventory.filter((root) => root.includeFeatures.length !== 0).length,
        0,
      );
      assertSame(
        inventory.filter(
          (root) =>
            JSON.stringify(root.metadata?.includes) ===
            JSON.stringify(['compareArray.js']),
        ).length,
        1,
      );
      assertSame(
        inventory.filter(
          (root) => JSON.stringify(root.metadata?.flags) === '["noStrict"]',
        ).length,
        1,
      );
      assertSame(inventory.filter((root) => root.variants === 2).length, 80);
      assertSame(
        sameExactCounts(
          countFeatureProfiles(inventory),
          EXPECTED_FEATURE_PROFILE_COUNTS,
        ),
        true,
      );
      assertSame(
        paths.filter((sourcePath) =>
          matchExclusion(sourcePath, selection.exclusions),
        ).length,
        0,
      );
      assertSame(
        paths.filter((sourcePath) => selected.has(sourcePath)).length,
        0,
      );

      const unknownInclude = /** @type {any} */ (structuredClone(taxonomy));
      findClassification(unknownInclude, paths[0]).includes = [
        'unknown-p1c-helper.js',
      ];
      assertSame(
        assertThrows(
          () => syntheticP1CInventory(ledgerText, unknownInclude),
          Error,
        ).message,
        'ES2015 include unknown-p1c-helper.js is unknown',
      );
    },
  },
  {
    name: 'focused P1C runner executes every reviewed variant without listing tests',
    run: async () => {
      const { document, listTestsCalled } = await runFixtureP1C();

      assertSame(Object.keys(document).join(','), 'version,ledger,records');
      assertSame(document.ledger.roots, 81);
      assertSame(document.ledger.variants, 161);
      assertSame(document.records.length, 161);
      assertSame(
        document.records.every((record) => record.status === 'passed'),
        true,
      );
      assertSame(
        document.records.filter((record) => record.variant === 'non-strict')
          .length,
        81,
      );
      assertSame(
        document.records.filter((record) => record.variant === 'strict').length,
        80,
      );
      assertSame(listTestsCalled, false);
    },
  },
  {
    name: 'focused P1C collateral runner records only the exact expected parse failures',
    run: async () => {
      const { document, listTestsCalled } = await runFixtureP1CCollateral();

      assertSame(Object.keys(document).join(','), 'version,paths,records');
      assertSame(
        JSON.stringify(document.paths),
        JSON.stringify(EXPECTED_P1C_COLLATERAL_PATHS),
      );
      assertSame(document.records.length, 8);
      assertSame(
        document.records.every(
          (record, index) =>
            record.file ===
              EXPECTED_P1C_COLLATERAL_PATHS[Math.floor(index / 2)] &&
            record.variant === (index % 2 === 0 ? 'non-strict' : 'strict') &&
            record.status === 'failed' &&
            record.reason === 'parse-error' &&
            record.message ===
              'SyntaxError: rest elements are not supported in this context',
        ),
        true,
      );
      assertSame(listTestsCalled, false);

      let metadataMessage = '';
      try {
        await runFixtureP1CCollateral({
          metadataDriftPath: EXPECTED_P1C_COLLATERAL_PATHS[0],
        });
      } catch (error) {
        metadataMessage =
          error instanceof Error ? error.message : String(error);
      }
      assertSame(
        metadataMessage,
        `P1C collateral metadata drift: ${EXPECTED_P1C_COLLATERAL_PATHS[0]}`,
      );

      let passingMessage = '';
      try {
        await runFixtureP1CCollateral({ outcome: 'passed' });
      } catch (error) {
        passingMessage = error instanceof Error ? error.message : String(error);
      }
      assertSame(
        passingMessage,
        `P1C collateral execution drift: ${EXPECTED_P1C_COLLATERAL_PATHS[0]} (non-strict)`,
      );
    },
  },
  {
    name: 'focused P1C runner rejects non-UTC execution before reading Test262',
    run: async () => {
      const { runP1CFocused } = await loadP1C();
      let message = '';
      try {
        await runP1CFocused({
          environment: { TZ: 'America/Los_Angeles' },
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('TZ=UTC'), true);
    },
  },
  {
    name: 'focused P1C runner rejects pin drift before executing the suite',
    run: async () => {
      const { ledgerText, taxonomy } = await readP1CInputs();
      const { runP1CFocused } = await loadP1C();
      let message = '';
      try {
        await runP1CFocused({
          environment: { TZ: 'UTC' },
          ledgerText,
          taxonomy,
          pin: {
            repository: taxonomy.pin.repository,
            revision: '0000000000000000000000000000000000000000',
          },
          host: {
            readTest() {
              throw new Error('should not execute P1C host reads');
            },
            readInclude() {
              return '';
            },
            readModule() {
              throw new Error('should not read P1C modules');
            },
          },
          engine: {
            createRealm() {
              return {};
            },
            installHostBindings() {},
            evaluateScript() {
              return { type: 'normal', value: undefined };
            },
          },
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(
        message,
        'P1C taxonomy does not match the pinned Test262 checkout',
      );
    },
  },
  {
    name: 'focused P1C runner exposes failing execution evidence for exact review',
    run: async () => {
      const failPath =
        'test/language/statements/try/dstr/ary-init-iter-close.js';
      let message = '';
      let document = null;
      try {
        await runFixtureP1C({ failPath });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        document = /** @type {any} */ (error)?.p1cExecution ?? null;
      }

      assertSame(message, `P1C root did not completely pass: ${failPath}`);
      assertSame(document?.ledger.roots, 81);
      assertSame(document?.ledger.variants, 161);
      assertSame(document?.records.length, 161);
      assertSame(
        document?.records.filter(
          (/** @type {any} */ record) =>
            record.file === failPath && record.status === 'failed',
        ).length,
        2,
      );
    },
  },
  {
    name: 'P1C output paths stay contained and the runner source avoids broad imports',
    run: async () => {
      const { resolveP1COutputPath } = await loadP1C();
      let message = '';
      try {
        await resolveP1COutputPath(REPOSITORY_ROOT, '../p1c-output.json');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('outside the repository root'), true);
      assertSame(
        (
          await resolveP1COutputPath(
            REPOSITORY_ROOT,
            '.superpowers/sdd/2026-08-23-p1c-catch-binding/task-4/execution.json',
          )
        ).endsWith(
          '/.superpowers/sdd/2026-08-23-p1c-catch-binding/task-4/execution.json',
        ),
        true,
      );

      const source = await readFile(
        new URL('tools/test262/es2015-p1c.js', REPOSITORY_ROOT),
        'utf8',
      );
      for (const forbidden of [
        './es2015-audit.js',
        './upstream-run.js',
        './upstream-select.js',
      ]) {
        assertSame(source.includes(forbidden), false, forbidden);
      }
    },
  },
  {
    name: 'P1C authority evidence uses the generic six-file schemas',
    run: async () => {
      const { buildP1CAuthorityEvidence, P1C, P1C_PROMOTION_GROUP } =
        await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const evidence = buildP1CAuthorityEvidence({
        ledgerText: inputs.ledgerText,
        taxonomyText: inputs.taxonomyText,
        execution: syntheticP1CExecution(inputs.ledgerText, taxonomy),
        inventory: syntheticP1CInventory(inputs.ledgerText, taxonomy),
      });

      assertSame(evidence.paths.length, 81);
      assertSame(evidence.baseline.length, 81);
      assertSame(evidence.disposition.destinations.length, 81);
      assertSame(
        evidence.disposition.destinations.every(
          (entry) =>
            entry.status === 'selected-passing' &&
            entry.blocker === null &&
            entry.issue === 116,
        ),
        true,
      );
      assertSame(evidence.ownerDeltas.length, 0);
      assertSame(evidence.ownerMap.length, 0);
      assertSame(evidence.promotion.version, 2);
      assertSame(evidence.promotion.groupName, P1C_PROMOTION_GROUP);
      assertSame(evidence.promotion.rootCount, 81);
      assertSame(evidence.promotion.variantCount, 161);
      assertSame(evidence.promotion.ledgerSha256, P1C.sha256);
      assertSame(
        evidence.promotion.entries.every(
          (entry) => entry.includeFeatures.length === 0,
        ),
        true,
      );
      assertSame(
        parseEs2015Promotion(JSON.stringify(evidence.promotion)).entries.length,
        81,
      );
    },
  },
  {
    name: 'P1C authority evidence rejects execution, inventory, and disposition drift',
    run: async () => {
      const { buildP1CAuthorityEvidence } = await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const execution = syntheticP1CExecution(inputs.ledgerText, taxonomy);
      const inventory = syntheticP1CInventory(inputs.ledgerText, taxonomy);
      /**
       * @param {any} executionDocument
       * @param {readonly any[]} inventoryRoots
       * @param {any} [disposition]
       */
      const expectRejected = (executionDocument, inventoryRoots, disposition) =>
        assertThrows(
          () =>
            buildP1CAuthorityEvidence({
              ledgerText: inputs.ledgerText,
              taxonomyText: inputs.taxonomyText,
              execution: executionDocument,
              inventory: inventoryRoots,
              ...(disposition === undefined ? {} : { disposition }),
            }),
          Error,
        );

      const driftedInventory = /** @type {any[]} */ (
        structuredClone(inventory)
      );
      driftedInventory[0].metadata.features = [];
      assertSame(
        expectRejected(execution, driftedInventory).message.includes(
          'P1C pinned inventory drift',
        ),
        true,
      );

      const failedExecution = syntheticP1CExecution(
        inputs.ledgerText,
        taxonomy,
        {
          failPath: 'test/language/statements/try/dstr/ary-init-iter-close.js',
        },
      );
      assertSame(
        expectRejected(failedExecution, inventory).message.includes(
          'P1C root did not completely pass',
        ),
        true,
      );

      const skippedExecution = syntheticP1CExecution(
        inputs.ledgerText,
        taxonomy,
      );
      const skippedRecord = skippedExecution.records.find(
        (/** @type {any} */ record) =>
          record.file ===
            'test/language/statements/try/dstr/ary-init-iter-close.js' &&
          record.variant === 'non-strict',
      );
      if (skippedRecord === undefined) {
        throw new Error('missing P1C skipped fixture record');
      }
      skippedRecord.status = 'skipped';
      assertSame(
        expectRejected(skippedExecution, inventory).message.includes('skipped'),
        true,
      );

      const partialExecution = syntheticP1CExecution(
        inputs.ledgerText,
        taxonomy,
      );
      partialExecution.records.pop();
      assertSame(
        expectRejected(partialExecution, inventory).message.includes(
          'exact variants',
        ),
        true,
      );

      const foreignExecution = syntheticP1CExecution(
        inputs.ledgerText,
        taxonomy,
      );
      foreignExecution.records[0].file =
        'test/language/statements/try/foreign.js';
      assertSame(
        expectRejected(foreignExecution, inventory).message.includes(
          'foreign or duplicate',
        ),
        true,
      );

      const wrongDisposition = {
        destinations: execution.records
          .reduce(
            (/** @type {string[]} */ paths, /** @type {any} */ record) => {
              if (!paths.includes(record.file)) paths.push(record.file);
              return paths;
            },
            [],
          )
          .map((/** @type {string} */ path) => ({
            path,
            status: 'selected-passing',
            blocker: null,
            issue: 117,
          })),
      };
      assertSame(
        expectRejected(execution, inventory, wrongDisposition).message.includes(
          'disposition',
        ),
        true,
      );
    },
  },
  {
    name: 'P1C core projection changes only reviewed source and generated bytes',
    run: async () => {
      const { buildP1CAuthorityEvidence, projectP1CCoreOutputs } =
        await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const execution = syntheticP1CExecution(inputs.ledgerText, taxonomy);
      const collateralExecution = syntheticP1CCollateralExecution();
      const inventory = syntheticP1CInventory(inputs.ledgerText, taxonomy);
      const evidence = buildP1CAuthorityEvidence({
        ledgerText: inputs.ledgerText,
        taxonomyText: inputs.taxonomyText,
        execution,
        inventory,
      });
      const projected = projectP1CCoreOutputs({
        taxonomyText: inputs.taxonomyText,
        auditEvidenceText: inputs.auditEvidenceText,
        subsetText: inputs.subsetText,
        evidence,
        execution,
        collateralExecution,
        inventory,
      });
      const repeated = projectP1CCoreOutputs({
        taxonomyText: inputs.taxonomyText,
        auditEvidenceText: inputs.auditEvidenceText,
        subsetText: inputs.subsetText,
        evidence,
        execution,
        collateralExecution,
        inventory,
      });

      assertSame(
        Object.keys(projected).join(','),
        'taxonomyText,auditEvidenceText,subsetText',
      );
      assertSame(JSON.stringify(projected), JSON.stringify(repeated));

      const sourcePaths = new Set(evidence.paths);
      const collateralPaths = new Set(P1C_COLLATERAL_PATHS);
      const baseAudit = JSON.parse(inputs.auditEvidenceText);
      const headAudit = JSON.parse(projected.auditEvidenceText);
      const projectedSourceRecords = headAudit.auditRecords.filter(
        (/** @type {any} */ record) => sourcePaths.has(record.file),
      );
      assertSame(projectedSourceRecords.length, 161);
      assertSame(
        projectedSourceRecords.every(
          (/** @type {any} */ record) => record.status === 'passed',
        ),
        true,
      );
      assertSame(
        baseAudit.auditRecords.some((/** @type {any} */ record) =>
          collateralPaths.has(record.file),
        ),
        false,
      );
      const projectedCollateralRecords = headAudit.auditRecords.filter(
        (/** @type {any} */ record) => collateralPaths.has(record.file),
      );
      assertSame(projectedCollateralRecords.length, 8);
      assertSame(
        projectedCollateralRecords.every(
          (/** @type {any} */ record) => record.status === 'failed',
        ),
        true,
      );
      assertSame(
        JSON.stringify(
          headAudit.auditRecords.filter(
            (/** @type {any} */ record) =>
              !sourcePaths.has(record.file) &&
              !collateralPaths.has(record.file),
          ),
        ),
        JSON.stringify(
          baseAudit.auditRecords.filter(
            (/** @type {any} */ record) =>
              !sourcePaths.has(record.file) &&
              !collateralPaths.has(record.file),
          ),
        ),
      );
      assertSame(
        evidence.paths.every(
          (sourcePath) =>
            !Object.prototype.hasOwnProperty.call(
              headAudit.blockers,
              sourcePath,
            ),
        ),
        true,
      );
      assertSame(
        P1C_COLLATERAL_PATHS.every(
          (sourcePath) =>
            !Object.prototype.hasOwnProperty.call(
              baseAudit.blockers,
              sourcePath,
            ) &&
            headAudit.blockers[sourcePath] ===
              'early-errors-and-declaration-instantiation',
        ),
        true,
      );

      const baseTaxonomy = JSON.parse(inputs.taxonomyText);
      const baseByPath = new Map(
        baseTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const headTaxonomy = JSON.parse(projected.taxonomyText);
      let selectedRoots = 0;
      let blockedCollateralRoots = 0;
      for (const entry of headTaxonomy.classifications) {
        const base = baseByPath.get(entry.path);
        if (collateralPaths.has(entry.path)) {
          const index = P1C_COLLATERAL_PATHS.indexOf(entry.path);
          assertSame(
            JSON.stringify(base),
            JSON.stringify(P1C_COLLATERAL_BASE_CLASSIFICATIONS[index]),
          );
          assertSame(
            JSON.stringify(entry),
            JSON.stringify(P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS[index]),
          );
          blockedCollateralRoots += 1;
          continue;
        }
        if (!sourcePaths.has(entry.path)) {
          assertSame(JSON.stringify(entry), JSON.stringify(base));
          continue;
        }
        const stableBase = { ...base };
        const stableHead = { ...entry };
        Reflect.deleteProperty(stableBase, 'status');
        Reflect.deleteProperty(stableBase, 'blocker');
        Reflect.deleteProperty(stableHead, 'status');
        Reflect.deleteProperty(stableHead, 'blocker');
        assertSame(JSON.stringify(stableHead), JSON.stringify(stableBase));
        assertSame(entry.status, 'selected-passing');
        assertSame(entry.blocker, null);
        selectedRoots += 1;
      }
      assertSame(selectedRoots, 81);
      assertSame(blockedCollateralRoots, 4);

      const baseSubset = parseUpstreamSubset(inputs.subsetText);
      const headSubset = parseUpstreamSubset(projected.subsetText);
      const groups = headSubset.groups.filter(
        (group) => group.name === 'es2015/p1c-catch-binding',
      );
      assertSame(groups.length, 1);
      assertSame(
        JSON.stringify(groups[0].paths),
        JSON.stringify(evidence.paths),
      );
      assertSame(headSubset.groups.length, baseSubset.groups.length + 1);
      assertSame(
        upstreamSubsetPaths(headSubset).length,
        upstreamSubsetPaths(baseSubset).length + 77,
      );
      assertSame(
        P1C_COLLATERAL_PATHS.some((sourcePath) =>
          upstreamSubsetPaths(headSubset).includes(sourcePath),
        ),
        false,
      );

      /** @type {Array<(document: any) => void>} */
      const hostileExecutions = [
        (document) => {
          document.paths.reverse();
        },
        (document) => {
          document.records.pop();
        },
        (document) => {
          document.records[1] = structuredClone(document.records[0]);
        },
        (document) => {
          document.records[0].file = 'test/language/expressions/foreign.js';
        },
        (document) => {
          document.records[0].variant = 'strict';
        },
        (document) => {
          document.records[0].status = 'passed';
        },
        (document) => {
          document.records[0].reason = 'unexpected-throw';
        },
        (document) => {
          document.records[0].message = 'SyntaxError: drift';
        },
        (document) => {
          document.records[0].features = ['destructuring-binding'];
        },
      ];
      for (const mutate of hostileExecutions) {
        const hostile = /** @type {any} */ (
          structuredClone(collateralExecution)
        );
        mutate(hostile);
        assertSame(
          assertThrows(
            () =>
              projectP1CCoreOutputs({
                taxonomyText: inputs.taxonomyText,
                auditEvidenceText: inputs.auditEvidenceText,
                subsetText: inputs.subsetText,
                evidence,
                execution,
                collateralExecution: hostile,
                inventory,
              }),
            Error,
          ).message.includes('P1C collateral execution'),
          true,
        );
      }
    },
  },
  {
    name: 'P1C report artifacts add promoted selected records in exact order',
    run: async () => {
      const {
        buildP1CAuthorityEvidence,
        buildP1CReportArtifacts,
        projectP1CCoreOutputs,
      } = await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const execution = syntheticP1CExecution(inputs.ledgerText, taxonomy);
      const collateralExecution = syntheticP1CCollateralExecution();
      const inventory = syntheticP1CInventory(inputs.ledgerText, taxonomy);
      const evidence = buildP1CAuthorityEvidence({
        ledgerText: inputs.ledgerText,
        taxonomyText: inputs.taxonomyText,
        execution,
        inventory,
      });
      const projected = projectP1CCoreOutputs({
        taxonomyText: inputs.taxonomyText,
        auditEvidenceText: inputs.auditEvidenceText,
        subsetText: inputs.subsetText,
        evidence,
        execution,
        collateralExecution,
        inventory,
      });
      const artifacts = buildP1CReportArtifacts({
        reportText: inputs.reportText,
        conformanceText: inputs.conformanceText,
        subsetText: projected.subsetText,
        taxonomyText: projected.taxonomyText,
        auditEvidenceText: projected.auditEvidenceText,
        promotionText: renderP1CJson(evidence.promotion),
        featuresText: inputs.featuresText,
      });
      const repeated = buildP1CReportArtifacts({
        reportText: inputs.reportText,
        conformanceText: inputs.conformanceText,
        subsetText: projected.subsetText,
        taxonomyText: projected.taxonomyText,
        auditEvidenceText: projected.auditEvidenceText,
        promotionText: renderP1CJson(evidence.promotion),
        featuresText: inputs.featuresText,
      });

      assertSame(
        Object.keys(artifacts).join(','),
        'reportText,conformanceText',
      );
      assertSame(JSON.stringify(artifacts), JSON.stringify(repeated));

      const reportRecords = artifacts.reportText
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
      const promotedByPath = new Map(
        evidence.promotion.entries.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const promotedRecords = reportRecords.filter(
        (/** @type {any} */ record) =>
          record.type === 'test' && promotedByPath.has(record.file),
      );
      assertSame(promotedRecords.length, 161);
      assertSame(
        promotedRecords.every(
          (/** @type {any} */ record) => record.status === 'passed',
        ),
        true,
      );
      assertSame(
        promotedRecords.every((/** @type {any} */ record) => {
          const promotion = promotedByPath.get(record.file);
          return (
            promotion !== undefined &&
            JSON.stringify(record.features ?? []) ===
              JSON.stringify(promotion.features)
          );
        }),
        true,
      );
      assertSame(
        reportRecords.some(
          (/** @type {any} */ record) =>
            record.type === 'test' &&
            P1C_COLLATERAL_PATHS.includes(record.file),
        ),
        false,
      );
      const summary = reportRecords.find(
        (/** @type {any} */ record) => record.type === 'summary',
      );
      assertSame(summary?.total, 39292);
      assertSame(summary?.passed, 39292);
      assertSame(summary?.failed, 0);
      assertSame(summary?.skipped, 0);
      /** @param {string} text */
      const stripCoverage = (text) =>
        text.replace(
          /<!-- test262-coverage:begin -->[\s\S]*?<!-- test262-coverage:end -->/u,
          '<!-- test262-coverage:begin --><!-- test262-coverage:end -->',
        );
      assertSame(
        stripCoverage(artifacts.conformanceText),
        stripCoverage(inputs.conformanceText),
      );

      const baseReportRecords = inputs.reportText
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
      /**
       * @param {(records: any[]) => void} mutate
       */
      const expectCollateralReportRejected = (mutate) => {
        const records = structuredClone(baseReportRecords);
        mutate(records);
        return assertThrows(
          () =>
            buildP1CReportArtifacts({
              reportText: `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
              conformanceText: inputs.conformanceText,
              subsetText: projected.subsetText,
              taxonomyText: projected.taxonomyText,
              auditEvidenceText: projected.auditEvidenceText,
              promotionText: renderP1CJson(evidence.promotion),
              featuresText: inputs.featuresText,
            }),
          Error,
        );
      };
      const firstCollateral = (/** @type {any[]} */ records) =>
        records.find(
          (record) =>
            record.type === 'test' && record.file === P1C_COLLATERAL_PATHS[0],
        );
      assertSame(
        expectCollateralReportRejected((records) => {
          firstCollateral(records).status = 'failed';
        }).message.includes('collateral'),
        true,
      );
      assertSame(
        expectCollateralReportRejected((records) => {
          firstCollateral(records).features = ['destructuring-binding'];
        }).message.includes('collateral'),
        true,
      );
      assertSame(
        expectCollateralReportRejected((records) => {
          records.splice(records.indexOf(firstCollateral(records)), 1);
        }).message.includes('collateral'),
        true,
      );
    },
  },
  {
    name: 'P1C pending authority pins six evidence files and closed projections',
    run: async () => {
      const {
        buildP1CAuthorityEvidence,
        buildP1CReportArtifacts,
        buildP1CPendingAuthority,
        projectP1CCoreOutputs,
      } = await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const execution = syntheticP1CExecution(inputs.ledgerText, taxonomy);
      const collateralExecution = syntheticP1CCollateralExecution();
      const inventory = syntheticP1CInventory(inputs.ledgerText, taxonomy);
      const evidence = buildP1CAuthorityEvidence({
        ledgerText: inputs.ledgerText,
        taxonomyText: inputs.taxonomyText,
        execution,
        inventory,
      });
      const projected = projectP1CCoreOutputs({
        taxonomyText: inputs.taxonomyText,
        auditEvidenceText: inputs.auditEvidenceText,
        subsetText: inputs.subsetText,
        evidence,
        execution,
        collateralExecution,
        inventory,
      });
      const artifacts = buildP1CReportArtifacts({
        reportText: inputs.reportText,
        conformanceText: inputs.conformanceText,
        subsetText: projected.subsetText,
        taxonomyText: projected.taxonomyText,
        auditEvidenceText: projected.auditEvidenceText,
        promotionText: renderP1CJson(evidence.promotion),
        featuresText: inputs.featuresText,
      });
      const projectedTaxonomyText = renderP1CJson({
        ...JSON.parse(projected.taxonomyText),
        inputs: {
          ...JSON.parse(projected.taxonomyText).inputs,
          subsetSha256: sha256(projected.subsetText),
          selectedEvidenceSha256: sha256(artifacts.reportText),
          auditEvidenceSha256: sha256(projected.auditEvidenceText),
        },
      });
      const authority = buildP1CPendingAuthority({
        baseTaxonomyText: inputs.taxonomyText,
        evidenceTexts: buildP1CEvidenceTexts(evidence),
        baseOutputs: {
          'docs/conformance.md': inputs.conformanceText,
          'docs/test262-report.jsonl': inputs.reportText,
          'tools/test262/es2015-audit-evidence.json': inputs.auditEvidenceText,
          'tools/test262/es2015-taxonomy.json': inputs.taxonomyText,
          'tools/test262/upstream-subset.json': inputs.subsetText,
        },
        projectedOutputs: {
          'docs/conformance.md': artifacts.conformanceText,
          'docs/test262-report.jsonl': artifacts.reportText,
          'tools/test262/es2015-audit-evidence.json':
            projected.auditEvidenceText,
          'tools/test262/es2015-taxonomy.json': projectedTaxonomyText,
          'tools/test262/upstream-subset.json': projected.subsetText,
        },
      });

      assertSame(authority.code, 'P1C');
      assertSame(authority.issue, 116);
      assertSame(authority.parentIssue, 70);
      assertSame(authority.state, 'pending');
      assertSame(authority.source.rootCount, 81);
      assertSame(authority.source.variantCount, 161);
      assertSame(authority.source.pathSha256, inputs.ledgerSha256);
      assertSame(authority.source.entryLedgerSha256, null);
      assertSame(authority.reconciliation, null);
      assertSame(authority.evidence.length, 6);
      assertSame(authority.protectedOutputs.length, 11);
      assertSame(
        authority.protectedOutputs.filter(
          (output) => output.operation === 'add-exact',
        ).length,
        6,
      );
      assertSame(
        authority.protectedOutputs.filter(
          (output) => output.operation === 'replace-exact',
        ).length,
        3,
      );
      assertSame(
        authority.protectedOutputs.filter(
          (output) => output.operation === 'project',
        ).length,
        2,
      );
      assertSame(authority.destinations.length, 1);
      assertSame(authority.destinations[0].status, 'selected-passing');
      assertSame(authority.destinations[0].blocker, null);
      assertSame(authority.destinations[0].issue, 116);
      assertSame(
        authority.protectedOutputs.some(
          (output) => output.path === 'tools/test262/es5-selection.json',
        ),
        false,
      );
      assertSame(
        sha256(projected.auditEvidenceText),
        '50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c',
      );
      assertSame(
        sha256(projectedTaxonomyText),
        'fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7',
      );
      assertSame(
        sha256(projected.subsetText),
        '5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14',
      );
      assertSame(
        sha256(artifacts.reportText),
        '89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff',
      );
      assertSame(
        sha256(artifacts.conformanceText),
        '9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe',
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(authority),
        '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278',
      );
      assertSame(
        roadmapAggregateProjectionSha256(authority),
        '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813',
      );
      const appliedAuthority = structuredClone(authority);
      appliedAuthority.state = 'applied';
      assertSame(
        canonicalRoadmapAuthoritySha256(appliedAuthority),
        P1C_CORRECTED_APPLIED_RECORD_SHA256,
      );
      const trackedAuthority = JSON.parse(
        await readFile(
          new URL('tools/test262/es2015-provenance.json', REPOSITORY_ROOT),
          'utf8',
        ),
      ).roadmapAuthorities.find(
        (/** @type {any} */ entry) => entry.code === 'P1C',
      );
      assertSame(
        JSON.stringify(trackedAuthority),
        JSON.stringify(appliedAuthority),
      );
    },
  },
  {
    name: 'P1C build-scratch does not reuse applied outputs as a new authority base',
    run: async () => {
      const { main } = await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const fixturePath = `.superpowers/test/es2015-p1c-${randomUUID()}`;
      const fixtureUrl = new URL(`${fixturePath}/`, REPOSITORY_ROOT);
      const executionPath = `${fixturePath}/unit-execution.json`;
      const outputPath = `${fixturePath}/unit-authority`;
      const sourceByPath = syntheticP1CSources(inputs.ledgerText, taxonomy);
      const message = await (async () => {
        await mkdir(fixtureUrl, { recursive: true });
        try {
          await writeFile(
            new URL('unit-execution.json', fixtureUrl),
            renderP1CJson(syntheticP1CExecution(inputs.ledgerText, taxonomy)),
            'utf8',
          );
          try {
            await main(
              [
                '--build-scratch',
                '--ledger=tools/test262/es2015-p1c-paths.txt',
                `--execution=${executionPath}`,
                `--output=${outputPath}`,
              ],
              {
                environment: { TZ: 'UTC' },
                readPin: async () => ({
                  repository: taxonomy.pin.repository,
                  revision: taxonomy.pin.revision,
                  checkoutPath: 'vendor/test262',
                }),
                assertPinnedCheckout: async () => {},
                readRoot: async (sourcePath) => {
                  const source = sourceByPath.get(sourcePath);
                  if (source === undefined) {
                    throw new Error(
                      `missing synthetic P1C source ${sourcePath}`,
                    );
                  }
                  return source;
                },
                readIncludeDefinitions: async () =>
                  syntheticP1CIncludeDefinitions(),
                runCollateralFocused: async () =>
                  syntheticP1CCollateralExecution(),
              },
            );
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
          return '';
        } finally {
          await rm(fixtureUrl, { recursive: true, force: true });
        }
      })();

      assertSame(
        message,
        'P1C BASE classification mismatch: test/language/statements/try/dstr/ary-init-iter-close.js',
      );
    },
  },
];

async function loadP1C() {
  return import('../../tools/test262/es2015-p1c.js');
}

/** @param {string} path */
function readP1CConsumerBaseText(path) {
  return execFileSync(
    'git',
    ['-c', 'core.pager=cat', 'show', `${P1C_CONSUMER_BASE}:${path}`],
    /** @type {any} */ ({
      cwd: REPOSITORY_ROOT_PATH,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

async function readP1CInputs() {
  const ledgerText = await readFile(
    new URL('tools/test262/es2015-p1c-paths.txt', REPOSITORY_ROOT),
    'utf8',
  );
  const taxonomyText = readP1CConsumerBaseText(
    'tools/test262/es2015-taxonomy.json',
  );
  const selectionText = readP1CConsumerBaseText(
    'tools/test262/es5-selection.json',
  );
  const subsetText = readP1CConsumerBaseText(
    'tools/test262/upstream-subset.json',
  );
  return {
    ledgerText,
    taxonomy: JSON.parse(taxonomyText),
    selection: parseEs5Selection(selectionText),
    subset: parseUpstreamSubset(subsetText),
  };
}

async function readP1CProjectionInputs() {
  const [ledgerText, featuresText] = await Promise.all(
    ['tools/test262/es2015-p1c-paths.txt', 'tools/test262/features.json'].map(
      (file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8'),
    ),
  );
  const taxonomyText = readP1CConsumerBaseText(
    'tools/test262/es2015-taxonomy.json',
  );
  const auditEvidenceText = readP1CConsumerBaseText(
    'tools/test262/es2015-audit-evidence.json',
  );
  const subsetText = readP1CConsumerBaseText(
    'tools/test262/upstream-subset.json',
  );
  const reportText = readP1CConsumerBaseText('docs/test262-report.jsonl');
  const conformanceText = readP1CConsumerBaseText('docs/conformance.md');
  return {
    ledgerText,
    ledgerSha256: sha256(ledgerText),
    taxonomyText,
    auditEvidenceText,
    subsetText,
    reportText,
    conformanceText,
    featuresText,
  };
}

/**
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   failPath?: string,
 *   pin?: { repository: string, revision: string },
 * }} [options]
 */
async function runFixtureP1C(options = {}) {
  const { ledgerText, taxonomy } = await readP1CInputs();
  const { runP1CFocused } = await loadP1C();
  const byPath = new Map(
    taxonomy.classifications.map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  let listTestsCalled = false;
  const host = {
    /** @param {string} file */
    readTest(file) {
      const entry = byPath.get(file);
      if (entry === undefined) {
        throw new Error(`foreign P1C fixture path: ${file}`);
      }
      return renderFixtureSource(
        entry,
        options.failPath === file ? 'P1C_FIXTURE_FAILURE' : 'P1C_FIXTURE_PASS',
      );
    },
    readInclude() {
      return '';
    },
    readModule() {
      throw new Error('P1C fixture does not use modules');
    },
    listTests() {
      listTestsCalled = true;
      throw new Error('P1C fixture must not list tests');
    },
  };
  const engine = {
    createRealm() {
      return {};
    },
    installHostBindings() {},
    /** @param {any} _realm @param {string} source */
    evaluateScript(_realm, source) {
      return source.includes('P1C_FIXTURE_FAILURE')
        ? { type: 'throw', value: 'expected P1C fixture failure' }
        : { type: 'normal', value: undefined };
    },
  };
  const document = await runP1CFocused({
    environment: options.environment ?? { TZ: 'UTC' },
    ledgerText,
    taxonomy,
    pin: options.pin ?? taxonomy.pin,
    host,
    engine,
  });
  return { document, listTestsCalled };
}

/**
 * @param {{
 *   metadataDriftPath?: string,
 *   outcome?: 'failed' | 'passed',
 * }} [options]
 */
async function runFixtureP1CCollateral(options = {}) {
  const { runP1CCollateralFocused } = await loadP1C();
  let listTestsCalled = false;
  const host = {
    /** @param {string} file */
    readTest(file) {
      if (!EXPECTED_P1C_COLLATERAL_PATHS.includes(file)) {
        throw new Error(`foreign P1C collateral fixture path: ${file}`);
      }
      const features =
        options.metadataDriftPath === file
          ? ['destructuring-binding']
          : ['destructuring-binding', 'default-parameters'];
      return [
        '/*---',
        'description: focused P1C collateral runner fixture',
        `features: ${JSON.stringify(features)}`,
        'flags: [generated]',
        '---*/',
        'P1C_COLLATERAL_FIXTURE;',
      ].join('\n');
    },
    readInclude() {
      return '';
    },
    readModule() {
      throw new Error('P1C collateral fixture does not use modules');
    },
    listTests() {
      listTestsCalled = true;
      throw new Error('P1C collateral fixture must not list tests');
    },
  };
  const engine = {
    createRealm() {
      return {};
    },
    installHostBindings() {},
    /** @param {any} _realm @param {string} source */
    evaluateScript(_realm, source) {
      if (
        options.outcome === 'passed' ||
        !source.includes('P1C_COLLATERAL_FIXTURE')
      ) {
        return { type: 'normal', value: undefined };
      }
      throw new SyntaxError('rest elements are not supported in this context');
    },
  };
  const document = await runP1CCollateralFocused({
    environment: { TZ: 'UTC' },
    host,
    engine,
  });
  return { document, listTestsCalled };
}

/** @param {readonly any[]} inventory */
function countFeatureProfiles(inventory) {
  const counts = new Map();
  for (const root of inventory) {
    if (root.metadata === null) {
      throw new Error(
        `P1C inventory metadata unexpectedly missing for ${root.path}`,
      );
    }
    const key = JSON.stringify(root.metadata.features);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

/**
 * @param {Record<string, number>} actual
 * @param {Record<string, number>} expected
 */
function sameExactCounts(actual, expected) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys) &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

/**
 * @param {{ classifications?: readonly any[] }} taxonomy
 * @param {string} sourcePath
 */
function findClassification(taxonomy, sourcePath) {
  const entry = (taxonomy.classifications ?? []).find(
    (/** @type {any} */ candidate) => candidate.path === sourcePath,
  );
  if (entry === undefined) {
    throw new Error(`missing taxonomy fixture: ${sourcePath}`);
  }
  return entry;
}

/**
 * @param {{ features: readonly string[], flags: readonly string[], includes: readonly string[] }} entry
 * @param {'P1C_FIXTURE_FAILURE' | 'P1C_FIXTURE_PASS'} outcome
 */
function renderFixtureSource(entry, outcome) {
  const lines = ['/*---', 'description: focused P1C runner fixture'];
  if (entry.features.length > 0) {
    lines.push(`features: ${JSON.stringify(entry.features)}`);
  }
  if (entry.flags.length > 0) {
    lines.push(`flags: ${JSON.stringify(entry.flags)}`);
  }
  if (entry.includes.length > 0) {
    lines.push(`includes: ${JSON.stringify(entry.includes)}`);
  }
  lines.push('---*/', outcome, '0;');
  return lines.join('\n');
}

/** @param {any} evidence */
function buildP1CEvidenceTexts(evidence) {
  return {
    'tools/test262/es2015-p1c-paths.json': renderP1CJson(evidence.paths),
    'tools/test262/es2015-p1c-baseline.json': renderP1CJson(evidence.baseline),
    'tools/test262/es2015-p1c-disposition.json': renderP1CJson(
      evidence.disposition,
    ),
    'tools/test262/es2015-p1c-owner-deltas.json': renderP1CJson(
      evidence.ownerDeltas,
    ),
    'tools/test262/es2015-p1c-owner-map.json': renderP1CJson(evidence.ownerMap),
    'tools/test262/es2015-p1c-promotion.json': renderP1CJson(
      evidence.promotion,
    ),
  };
}

/** @param {unknown} value */
function renderP1CJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function syntheticP1CIncludeDefinitions() {
  const facts = { features: [], includes: [] };
  return new Map([
    ['compareArray', facts],
    ['compareArray.js', facts],
  ]);
}

/**
 * @param {string} ledgerText
 * @param {{ classifications?: readonly any[] }} taxonomy
 */
function syntheticP1CInventory(ledgerText, taxonomy) {
  const paths = ledgerText.trimEnd().split('\n');
  const byPath = new Map(
    (taxonomy.classifications ?? []).map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  return buildEs2015Inventory({
    roots: paths.map((/** @type {string} */ sourcePath) => {
      const entry = byPath.get(sourcePath);
      if (entry === undefined) {
        throw new Error(
          `missing synthetic P1C inventory fixture: ${sourcePath}`,
        );
      }
      return {
        path: sourcePath,
        metadata: {
          features: entry.features,
          flags: entry.flags,
          includes: entry.includes,
        },
      };
    }),
    includeDefinitions: syntheticP1CIncludeDefinitions(),
  });
}

function syntheticP1CCollateralExecution() {
  return {
    version: /** @type {const} */ (1),
    paths: [...EXPECTED_P1C_COLLATERAL_PATHS],
    records: EXPECTED_P1C_COLLATERAL_PATHS.flatMap((file) =>
      ['non-strict', 'strict'].map((variant) => ({
        type: /** @type {const} */ ('test'),
        file,
        variant: /** @type {'non-strict' | 'strict'} */ (variant),
        status: /** @type {const} */ ('failed'),
        reason: /** @type {const} */ ('parse-error'),
        message: 'SyntaxError: rest elements are not supported in this context',
        features: ['default-parameters', 'destructuring-binding'],
      })),
    ),
  };
}

/**
 * @param {string} ledgerText
 * @param {{ classifications?: readonly any[] }} taxonomy
 * @param {{
 *   failPath?: string,
 *   foreignPath?: string,
 *   status?: 'passed' | 'failed' | 'skipped',
 * }} [options]
 */
function syntheticP1CExecution(ledgerText, taxonomy, options = {}) {
  const paths = ledgerText.trimEnd().split('\n');
  const byPath = new Map(
    (taxonomy.classifications ?? []).map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  return {
    version: 1,
    ledger: {
      roots: 81,
      variants: 161,
      sha256:
        'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
    },
    records: paths.flatMap((/** @type {string} */ sourcePath) => {
      const entry = byPath.get(sourcePath);
      if (entry === undefined) {
        throw new Error(
          `missing synthetic P1C execution fixture: ${sourcePath}`,
        );
      }
      const variants =
        JSON.stringify(entry.flags) === '["noStrict"]'
          ? ['non-strict']
          : ['non-strict', 'strict'];
      return variants.map((variant) => ({
        type: 'test',
        file:
          options.foreignPath !== undefined && sourcePath === paths[0]
            ? options.foreignPath
            : sourcePath,
        variant,
        status:
          options.failPath === sourcePath
            ? 'failed'
            : (options.status ?? 'passed'),
      }));
    }),
  };
}

/**
 * @param {string} ledgerText
 * @param {{ classifications?: readonly any[] }} taxonomy
 */
function syntheticP1CSources(ledgerText, taxonomy) {
  const paths = ledgerText.trimEnd().split('\n');
  const byPath = new Map(
    (taxonomy.classifications ?? []).map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  return new Map(
    paths.map((/** @type {string} */ sourcePath) => {
      const entry = byPath.get(sourcePath);
      if (entry === undefined) {
        throw new Error(`missing synthetic P1C source fixture: ${sourcePath}`);
      }
      return [sourcePath, renderFixtureSource(entry, 'P1C_FIXTURE_PASS')];
    }),
  );
}
