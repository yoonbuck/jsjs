import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
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
import { readTest262HarnessDefinitions } from '../../tools/test262/harness-definitions.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/pin.js';
import {
  parseUpstreamSubset,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const { structuredClone } = globalThis;
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
    name: 'P1C inventory matches the pinned include closure and zero-overlap policy',
    run: async () => {
      const { verifyP1CLedger } = await loadP1C();
      const { ledgerText, taxonomy, selection, subset } = await readP1CInputs();
      const inventory = await readPinnedP1CInventory(ledgerText, taxonomy);
      const paths = verifyP1CLedger(ledgerText, taxonomy);
      const selected = new Set(upstreamSubsetPaths(subset));

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
    name: 'P1C build-scratch writes the exact authority bundle',
    run: async () => {
      const { main } = await loadP1C();
      const inputs = await readP1CProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const executionPath =
        '.superpowers/sdd/2026-08-23-p1c-catch-binding/task-5/unit-execution.json';
      const outputPath =
        '.superpowers/sdd/2026-08-23-p1c-catch-binding/task-5/unit-authority';
      const outputUrl = new URL(outputPath, REPOSITORY_ROOT);
      const executionUrl = new URL(executionPath, REPOSITORY_ROOT);
      const sourceByPath = syntheticP1CSources(inputs.ledgerText, taxonomy);
      const status = await (async () => {
        await rm(outputUrl, { recursive: true, force: true });
        await rm(executionUrl, { force: true });
        await writeFile(
          executionUrl,
          renderP1CJson(syntheticP1CExecution(inputs.ledgerText, taxonomy)),
          'utf8',
        );
        try {
          return await main(
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
                  throw new Error(`missing synthetic P1C source ${sourcePath}`);
                }
                return source;
              },
              readIncludeDefinitions: async () =>
                syntheticP1CIncludeDefinitions(),
            },
          );
        } finally {
          await rm(outputUrl, { recursive: true, force: true });
          await rm(executionUrl, { force: true });
        }
      })();

      assertSame(status, 0);
    },
  },
];

async function loadP1C() {
  return import('../../tools/test262/es2015-p1c.js');
}

async function readP1CInputs() {
  const [ledgerText, taxonomyText, selectionText, subsetText] =
    await Promise.all([
      readFile(
        new URL('tools/test262/es2015-p1c-paths.txt', REPOSITORY_ROOT),
        'utf8',
      ),
      readFile(
        new URL('tools/test262/es2015-taxonomy.json', REPOSITORY_ROOT),
        'utf8',
      ),
      readFile(
        new URL('tools/test262/es5-selection.json', REPOSITORY_ROOT),
        'utf8',
      ),
      readFile(
        new URL('tools/test262/upstream-subset.json', REPOSITORY_ROOT),
        'utf8',
      ),
    ]);
  return {
    ledgerText,
    taxonomy: JSON.parse(taxonomyText),
    selection: parseEs5Selection(selectionText),
    subset: parseUpstreamSubset(subsetText),
  };
}

async function readP1CProjectionInputs() {
  const [
    ledgerText,
    taxonomyText,
    auditEvidenceText,
    subsetText,
    reportText,
    conformanceText,
    featuresText,
  ] = await Promise.all(
    [
      'tools/test262/es2015-p1c-paths.txt',
      'tools/test262/es2015-taxonomy.json',
      'tools/test262/es2015-audit-evidence.json',
      'tools/test262/upstream-subset.json',
      'docs/test262-report.jsonl',
      'docs/conformance.md',
      'tools/test262/features.json',
    ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
  );
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
 * @param {string} ledgerText
 * @param {{ classifications?: readonly any[] }} taxonomy
 */
async function readPinnedP1CInventory(ledgerText, taxonomy) {
  const { buildP1CInventory } = await loadP1C();
  const pin = await readTest262Pin(REPOSITORY_ROOT);
  await assertPinnedCheckout(pin, REPOSITORY_ROOT);
  const host = createNodeTest262Host({
    root: new URL(`${pin.checkoutPath.replace(/\/$/u, '')}/`, REPOSITORY_ROOT),
  });
  const includeDefinitions = await readTest262HarnessDefinitions(
    pin.checkoutPath,
    REPOSITORY_ROOT,
  );
  return buildP1CInventory({
    ledgerText,
    taxonomy,
    readRoot: (sourcePath) => host.readTest(sourcePath),
    includeDefinitions,
  });
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
