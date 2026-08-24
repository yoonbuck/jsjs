import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame, assertThrows } from '../harness/assert.js';
import { buildEs2015Inventory } from '../../tools/test262/es2015-taxonomy.js';
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
const { structuredClone } = globalThis;
const P1C_CONSUMER_BASE = 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b';
const P1C_EVIDENCE_PATHS = Object.freeze([
  'tools/test262/es2015-p1c-paths.json',
  'tools/test262/es2015-p1c-baseline.json',
  'tools/test262/es2015-p1c-disposition.json',
  'tools/test262/es2015-p1c-owner-deltas.json',
  'tools/test262/es2015-p1c-owner-map.json',
  'tools/test262/es2015-p1c-promotion.json',
]);
const P1C_PROJECTED_OUTPUT_SHA256 = Object.freeze({
  'docs/conformance.md':
    'd59027686ed08e1e5c3a3cf3d523b2716d91991353810744dd2444f9d662fffd',
  'docs/test262-report.jsonl':
    'abcdf8240da7264fcccf3fcc4bada1f10c35eb02810aa3d87b6a67b13437a07a',
  'tools/test262/es2015-audit-evidence.json':
    '06817df31fa640d058ce19ac6b01e589e487313a7ec6572f3d888d5412ffd197',
  'tools/test262/es2015-taxonomy.json':
    '2db8bf5b5a6987362b77e539f57724f279570eb83f46641b158843996e6216d3',
  'tools/test262/upstream-subset.json':
    '2a8128d47e577341200c8571a74556899a44fdcd182d8e621e7798d404b4ca19',
});
const EXPECTED_FEATURE_PROFILE_COUNTS = Object.freeze({
  '[]': 2,
  '["Symbol.iterator","destructuring-binding"]': 8,
  '["Symbol.iterator","destructuring-binding","generators"]': 1,
  '["destructuring-binding"]': 58,
  '["destructuring-binding","generators"]': 11,
  '["let"]': 1,
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
    name: 'applied P1C execution reconstructs and validates the exact source taxonomy',
    run: async () => {
      const p1c = await loadP1C();
      const reconstruct = p1c.reconstructAppliedP1CSourceTaxonomy;
      assertSame(typeof reconstruct, 'function');
      if (typeof reconstruct !== 'function') return;
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
      assertSame(
        assertThrows(
          () => reconstruct({ ...options, baselineText: `${baselineText} ` }),
          Error,
        ).message,
        'Focused P1C execution evidence does not match authority',
      );

      const disposition = JSON.parse(dispositionText);
      const sourcePath = disposition.destinations[0].path;
      const mismatched = JSON.parse(taxonomyText);
      const mismatchedEntry = findClassification(mismatched, sourcePath);
      mismatchedEntry.status =
        mismatchedEntry.status === 'selected-passing'
          ? 'blocked:early-errors-and-declaration-instantiation'
          : 'selected-passing';
      mismatchedEntry.blocker =
        mismatchedEntry.status === 'selected-passing'
          ? null
          : 'early-errors-and-declaration-instantiation';
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
            reconstruct({
              ...options,
              taxonomyText: renderP1CJson(drifted),
            }),
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
        inventory,
      });
      const repeated = projectP1CCoreOutputs({
        taxonomyText: inputs.taxonomyText,
        auditEvidenceText: inputs.auditEvidenceText,
        subsetText: inputs.subsetText,
        evidence,
        execution,
        inventory,
      });

      assertSame(
        Object.keys(projected).join(','),
        'taxonomyText,auditEvidenceText,subsetText',
      );
      assertSame(JSON.stringify(projected), JSON.stringify(repeated));

      const sourcePaths = new Set(evidence.paths);
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
        JSON.stringify(
          headAudit.auditRecords.filter(
            (/** @type {any} */ record) => !sourcePaths.has(record.file),
          ),
        ),
        JSON.stringify(
          baseAudit.auditRecords.filter(
            (/** @type {any} */ record) => !sourcePaths.has(record.file),
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

      const baseTaxonomy = JSON.parse(inputs.taxonomyText);
      const baseByPath = new Map(
        baseTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const headTaxonomy = JSON.parse(projected.taxonomyText);
      let selectedRoots = 0;
      for (const entry of headTaxonomy.classifications) {
        const base = baseByPath.get(entry.path);
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
        upstreamSubsetPaths(baseSubset).length + 81,
      );
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
          'tools/test262/es2015-taxonomy.json': projected.taxonomyText,
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
        1,
      );
      assertSame(
        authority.protectedOutputs.filter(
          (output) => output.operation === 'project',
        ).length,
        4,
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
        /^[0-9a-f]{64}$/u.test(canonicalRoadmapAuthoritySha256(authority)),
        true,
      );
      assertSame(
        /^[0-9a-f]{64}$/u.test(roadmapAggregateProjectionSha256(authority)),
        true,
      );
    },
  },
  {
    name: 'tracked P1C evidence reproduces the exact applied consumer projection',
    run: async () => {
      const {
        P1C,
        buildP1CAuthorityEvidence,
        buildP1CPendingAuthority,
        buildP1CReportArtifacts,
        projectP1CCoreOutputs,
      } = await loadP1C();
      const [
        ledgerText,
        pathsText,
        baselineText,
        dispositionText,
        ownerDeltasText,
        ownerMapText,
        promotionText,
        taxonomyText,
        auditEvidenceText,
        subsetText,
        reportText,
        conformanceText,
        featuresText,
        selectionText,
        provenanceText,
      ] = await Promise.all(
        [
          'tools/test262/es2015-p1c-paths.txt',
          ...P1C_EVIDENCE_PATHS,
          'tools/test262/es2015-taxonomy.json',
          'tools/test262/es2015-audit-evidence.json',
          'tools/test262/upstream-subset.json',
          'docs/test262-report.jsonl',
          'docs/conformance.md',
          'tools/test262/features.json',
          'tools/test262/es5-selection.json',
          'tools/test262/es2015-provenance.json',
        ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
      );
      const baseTaxonomyText = readP1CConsumerBaseText(
        'tools/test262/es2015-taxonomy.json',
      );
      const baseAuditEvidenceText = readP1CConsumerBaseText(
        'tools/test262/es2015-audit-evidence.json',
      );
      const baseSubsetText = readP1CConsumerBaseText(
        'tools/test262/upstream-subset.json',
      );
      const baseReportText = readP1CConsumerBaseText(
        'docs/test262-report.jsonl',
      );
      const baseConformanceText = readP1CConsumerBaseText(
        'docs/conformance.md',
      );
      const baseSelectionText = readP1CConsumerBaseText(
        'tools/test262/es5-selection.json',
      );
      const paths = JSON.parse(pathsText);
      const sourcePaths = new Set(paths);
      const evidence = {
        paths,
        baseline: JSON.parse(baselineText),
        disposition: JSON.parse(dispositionText),
        ownerDeltas: JSON.parse(ownerDeltasText),
        ownerMap: JSON.parse(ownerMapText),
        promotion: JSON.parse(promotionText),
      };
      const execution = {
        version: 1,
        ledger: P1C,
        records: JSON.parse(auditEvidenceText).auditRecords.filter(
          (/** @type {any} */ record) => sourcePaths.has(record.file),
        ),
      };
      const inventory = syntheticP1CInventory(
        ledgerText,
        JSON.parse(baseTaxonomyText),
      );
      const rebuiltEvidence = buildP1CAuthorityEvidence({
        ledgerText,
        taxonomyText: baseTaxonomyText,
        execution,
        inventory,
      });
      const rebuiltEvidenceTexts = buildP1CEvidenceTexts(rebuiltEvidence);
      for (const path of P1C_EVIDENCE_PATHS) {
        assertSame(
          /** @type {Record<string, string>} */ (rebuiltEvidenceTexts)[path],
          await readFile(new URL(path, REPOSITORY_ROOT), 'utf8'),
          path,
        );
      }
      assertSame(ownerDeltasText, '[]\n');
      assertSame(ownerMapText, '[]\n');

      const projected = projectP1CCoreOutputs({
        taxonomyText: baseTaxonomyText,
        auditEvidenceText: baseAuditEvidenceText,
        subsetText: baseSubsetText,
        evidence,
        execution,
        inventory,
      });
      assertSame(projected.auditEvidenceText, auditEvidenceText);
      assertSame(projected.subsetText, subsetText);
      const artifacts = buildP1CReportArtifacts({
        reportText: baseReportText,
        conformanceText: baseConformanceText,
        subsetText: projected.subsetText,
        taxonomyText: projected.taxonomyText,
        auditEvidenceText: projected.auditEvidenceText,
        promotionText,
        featuresText,
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
      assertSame(projectedTaxonomyText, taxonomyText);
      assertSame(artifacts.reportText, reportText);
      assertSame(artifacts.conformanceText, conformanceText);
      assertSame(selectionText, baseSelectionText);

      const pendingAuthority = buildP1CPendingAuthority({
        baseTaxonomyText,
        evidenceTexts: rebuiltEvidenceTexts,
        baseOutputs: {
          'docs/conformance.md': baseConformanceText,
          'docs/test262-report.jsonl': baseReportText,
          'tools/test262/es2015-audit-evidence.json': baseAuditEvidenceText,
          'tools/test262/es2015-taxonomy.json': baseTaxonomyText,
          'tools/test262/upstream-subset.json': baseSubsetText,
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
      const trackedAuthority = JSON.parse(
        provenanceText,
      ).roadmapAuthorities.find(
        (/** @type {any} */ entry) => entry.code === 'P1C',
      );
      if (trackedAuthority === undefined) {
        throw new Error('missing tracked P1C roadmap authority');
      }
      const appliedAuthority = structuredClone(pendingAuthority);
      appliedAuthority.state = 'applied';
      assertSame(
        JSON.stringify(trackedAuthority),
        JSON.stringify(appliedAuthority),
      );
      assertSame(trackedAuthority.state, 'applied');
      assertSame(
        canonicalRoadmapAuthoritySha256(pendingAuthority),
        '3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193',
      );
      assertSame(
        roadmapAggregateProjectionSha256(trackedAuthority),
        '30354b59b9dea45a94b47ca5c1edf270c161e3230f04661e4ce6cfe8f9089b0b',
      );
      for (const [path, expected] of Object.entries(
        P1C_PROJECTED_OUTPUT_SHA256,
      )) {
        assertSame(
          sha256(await readFile(new URL(path, REPOSITORY_ROOT), 'utf8')),
          expected,
          path,
        );
      }
    },
  },
  {
    name: 'applied P1C moves only the exact live-base taxonomy and generated totals',
    run: async () => {
      const [pathsText, taxonomyText, subsetText, selectionText] =
        await Promise.all(
          [
            'tools/test262/es2015-p1c-paths.json',
            'tools/test262/es2015-taxonomy.json',
            'tools/test262/upstream-subset.json',
            'tools/test262/es5-selection.json',
          ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
        );
      const baseTaxonomyText = readP1CConsumerBaseText(
        'tools/test262/es2015-taxonomy.json',
      );
      const baseSubsetText = readP1CConsumerBaseText(
        'tools/test262/upstream-subset.json',
      );
      const baseSelectionText = readP1CConsumerBaseText(
        'tools/test262/es5-selection.json',
      );
      const sourcePaths = new Set(JSON.parse(pathsText));
      const baseTaxonomy = JSON.parse(baseTaxonomyText);
      const headTaxonomy = JSON.parse(taxonomyText);
      const baseByPath = new Map(
        baseTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const headByPath = new Map(
        headTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );

      assertSame(
        JSON.stringify(headTaxonomy.summary.partitions),
        JSON.stringify(baseTaxonomy.summary.partitions),
      );
      assertSame(headTaxonomy.summary.roots, baseTaxonomy.summary.roots);
      assertSame(headTaxonomy.summary.variants, baseTaxonomy.summary.variants);
      assertSame(headByPath.size, baseByPath.size);
      for (const [path, base] of baseByPath) {
        const head = headByPath.get(path);
        if (head === undefined) {
          throw new Error(`P1C projection removed taxonomy path ${path}`);
        }
        if (!sourcePaths.has(path)) {
          assertSame(JSON.stringify(head), JSON.stringify(base), path);
          continue;
        }
        const stableBase = { ...base };
        const stableHead = { ...head };
        Reflect.deleteProperty(stableBase, 'status');
        Reflect.deleteProperty(stableBase, 'blocker');
        Reflect.deleteProperty(stableHead, 'status');
        Reflect.deleteProperty(stableHead, 'blocker');
        assertSame(
          JSON.stringify(stableHead),
          JSON.stringify(stableBase),
          path,
        );
        assertSame(
          base.status,
          'blocked:early-errors-and-declaration-instantiation',
          path,
        );
        assertSame(
          base.blocker,
          'early-errors-and-declaration-instantiation',
          path,
        );
        assertSame(head.status, 'selected-passing', path);
        assertSame(head.blocker, null, path);
      }

      const baseCore = statusRows(baseTaxonomy.statusTables.core);
      const headCore = statusRows(headTaxonomy.statusTables.core);
      for (const [name, base] of baseCore) {
        const head = headCore.get(name);
        if (head === undefined) throw new Error(`missing core status ${name}`);
        if (name === 'selected-passing') {
          assertSame(head.roots - base.roots, 81);
          assertSame(head.variants - base.variants, 161);
        } else if (
          name === 'blocked:early-errors-and-declaration-instantiation'
        ) {
          assertSame(head.roots - base.roots, -81);
          assertSame(head.variants - base.variants, -161);
        } else {
          assertSame(JSON.stringify(head), JSON.stringify(base), name);
        }
      }

      const baseSubset = parseUpstreamSubset(baseSubsetText);
      const headSubset = parseUpstreamSubset(subsetText);
      const basePaths = upstreamSubsetPaths(baseSubset);
      const headPaths = upstreamSubsetPaths(headSubset);
      const p1cGroups = headSubset.groups.filter(
        (group) => group.name === 'es2015/p1c-catch-binding',
      );
      const baseNonT0 = baseSubset.groups
        .filter((group) => group.name !== 'es2015/audit-passing-promotion')
        .flatMap((group) => group.paths);
      const headNonT0 = headSubset.groups
        .filter((group) => group.name !== 'es2015/audit-passing-promotion')
        .flatMap((group) => group.paths);

      assertSame(baseSubset.groups.length, 61);
      assertSame(basePaths.length, 20595);
      assertSame(selectedVariants(baseTaxonomy, basePaths), 39139);
      assertSame(new Set(baseNonT0).size, 14272);
      assertSame(headSubset.groups.length, 62);
      assertSame(headPaths.length, 20676);
      assertSame(selectedVariants(headTaxonomy, headPaths), 39300);
      assertSame(new Set(headNonT0).size, 14353);
      assertSame(headSubset.groups.length - baseSubset.groups.length, 1);
      assertSame(headPaths.length - basePaths.length, 81);
      assertSame(
        selectedVariants(headTaxonomy, headPaths) -
          selectedVariants(baseTaxonomy, basePaths),
        161,
      );
      assertSame(new Set(headNonT0).size - new Set(baseNonT0).size, 81);
      assertSame(p1cGroups.length, 1);
      assertSame(
        JSON.stringify(p1cGroups[0]?.paths),
        JSON.stringify([...sourcePaths]),
      );
      assertSame(
        JSON.stringify(
          headSubset.groups.filter(
            (group) => group.name !== 'es2015/p1c-catch-binding',
          ),
        ),
        JSON.stringify(baseSubset.groups),
      );
      assertSame(
        [...sourcePaths].every((path) => !basePaths.includes(path)),
        true,
      );
      assertSame(
        [...sourcePaths].every((path) => headPaths.includes(path)),
        true,
      );
      assertSame(new Set(headNonT0).size, headNonT0.length);
      assertSame(selectionText, baseSelectionText);
    },
  },
  {
    name: 'applied P1C report order and promotion metadata stay exact',
    run: async () => {
      const [
        pathsText,
        promotionText,
        m1PromotionText,
        subsetText,
        reportText,
      ] = await Promise.all(
        [
          'tools/test262/es2015-p1c-paths.json',
          'tools/test262/es2015-p1c-promotion.json',
          'tools/test262/es2015-m1-promotion.json',
          'tools/test262/upstream-subset.json',
          'docs/test262-report.jsonl',
        ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
      );
      const sourcePaths = new Set(JSON.parse(pathsText));
      const promotion = parseEs2015Promotion(promotionText);
      const m1Promotion = parseEs2015Promotion(m1PromotionText);
      const selectedPaths = upstreamSubsetPaths(
        parseUpstreamSubset(subsetText),
      );
      const reportRecords = reportText
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter((record) => record.type === 'test');
      const reportPathOrder = [];
      for (const record of reportRecords) {
        if (reportPathOrder[reportPathOrder.length - 1] !== record.file) {
          reportPathOrder.push(record.file);
        }
      }
      assertSame(
        JSON.stringify(reportPathOrder),
        JSON.stringify(selectedPaths),
      );
      const p1cByPath = new Map(
        promotion.entries.map((entry) => [entry.path, entry]),
      );
      const p1cReportRecords = reportRecords.filter((record) =>
        sourcePaths.has(record.file),
      );
      assertSame(p1cReportRecords.length, 161);
      for (const entry of promotion.entries) {
        const records = p1cReportRecords.filter(
          (record) => record.file === entry.path,
        );
        assertSame(
          JSON.stringify(records.map((record) => record.variant)),
          JSON.stringify(
            entry.variants === 1 ? ['non-strict'] : ['non-strict', 'strict'],
          ),
          entry.path,
        );
        assertSame(
          records.every(
            (record) =>
              record.status === 'passed' &&
              JSON.stringify(record.features ?? []) ===
                JSON.stringify(p1cByPath.get(record.file)?.features),
          ),
          true,
          entry.path,
        );
      }

      const baseReportRecords = readP1CConsumerBaseText(
        'docs/test262-report.jsonl',
      )
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter((record) => record.type === 'test');
      const m1Paths = new Set(m1Promotion.entries.map((entry) => entry.path));
      assertSame(
        JSON.stringify(
          reportRecords.filter((record) => m1Paths.has(record.file)),
        ),
        JSON.stringify(
          baseReportRecords.filter((record) => m1Paths.has(record.file)),
        ),
      );
    },
  },
  {
    name: 'P1C consumer projection rejects evidence and promotion-order drift',
    run: async () => {
      const { P1C, projectP1CCoreOutputs } = await loadP1C();
      const [
        ledgerText,
        pathsText,
        baselineText,
        dispositionText,
        ownerDeltasText,
        ownerMapText,
        promotionText,
        auditEvidenceText,
      ] = await Promise.all(
        [
          'tools/test262/es2015-p1c-paths.txt',
          ...P1C_EVIDENCE_PATHS,
          'tools/test262/es2015-audit-evidence.json',
        ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
      );
      const baseTaxonomyText = readP1CConsumerBaseText(
        'tools/test262/es2015-taxonomy.json',
      );
      const sourcePaths = new Set(JSON.parse(pathsText));
      const exactEvidence = {
        paths: JSON.parse(pathsText),
        baseline: JSON.parse(baselineText),
        disposition: JSON.parse(dispositionText),
        ownerDeltas: JSON.parse(ownerDeltasText),
        ownerMap: JSON.parse(ownerMapText),
        promotion: JSON.parse(promotionText),
      };
      const execution = {
        version: 1,
        ledger: P1C,
        records: JSON.parse(auditEvidenceText).auditRecords.filter(
          (/** @type {any} */ record) => sourcePaths.has(record.file),
        ),
      };
      const inventory = syntheticP1CInventory(
        ledgerText,
        JSON.parse(baseTaxonomyText),
      );
      /** @param {(evidence: any) => void} mutate */
      const expectEvidenceRejected = (mutate) => {
        const evidence = structuredClone(exactEvidence);
        mutate(evidence);
        return assertThrows(
          () =>
            projectP1CCoreOutputs({
              taxonomyText: baseTaxonomyText,
              auditEvidenceText: readP1CConsumerBaseText(
                'tools/test262/es2015-audit-evidence.json',
              ),
              subsetText: readP1CConsumerBaseText(
                'tools/test262/upstream-subset.json',
              ),
              evidence,
              execution,
              inventory,
            }),
          Error,
        );
      };
      const featureEntry = exactEvidence.promotion.entries.find(
        (/** @type {any} */ entry) => entry.features.length > 1,
      );
      if (featureEntry === undefined) {
        throw new Error('missing multi-feature P1C promotion entry');
      }
      const featurePath = featureEntry.path;
      assertSame(
        expectEvidenceRejected((evidence) => {
          evidence.promotion.entries
            .find((/** @type {any} */ entry) => entry.path === featurePath)
            .features.reverse();
        }).message,
        'P1C projection requires exact authority evidence',
      );
      assertSame(
        expectEvidenceRejected((evidence) => {
          evidence.promotion.entries[0].includeFeatures = ['z', 'a'];
        }).message,
        'P1C projection requires exact authority evidence',
      );
      assertSame(
        expectEvidenceRejected((evidence) => {
          evidence.paths.pop();
        }).message.includes('reviewed 81-root'),
        true,
      );
      assertSame(
        expectEvidenceRejected((evidence) => {
          evidence.paths[0] = 'test/language/statements/try/foreign.js';
        }).message.includes('P1C ledger'),
        true,
      );
      assertSame(
        expectEvidenceRejected((evidence) => {
          evidence.ownerDeltas.push({
            path: exactEvidence.paths[0],
            status: 'blocked',
            blocker: 'early-errors-and-declaration-instantiation',
            issue: 116,
          });
        }).message,
        'P1C projection requires exact authority evidence',
      );
      assertSame(
        expectEvidenceRejected((evidence) => {
          evidence.ownerMap.push({
            status: 'blocked',
            blocker: 'early-errors-and-declaration-instantiation',
            issue: 116,
          });
        }).message,
        'P1C projection requires exact authority evidence',
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

/** @param {readonly { name: string, roots: number, variants: number }[]} rows */
function statusRows(rows) {
  return new Map(rows.map((entry) => [entry.name, entry]));
}

/**
 * @param {{ classifications: readonly { path: string, variants: number }[] }} taxonomy
 * @param {readonly string[]} paths
 */
function selectedVariants(taxonomy, paths) {
  const selected = new Set(paths);
  return taxonomy.classifications
    .filter((entry) => selected.has(entry.path))
    .reduce((total, entry) => total + entry.variants, 0);
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
