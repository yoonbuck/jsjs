import { readFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import {
  buildM0AuthorityEvidence,
  M0,
  parseM0Ledger,
  projectM0AuthorityOutputs,
  resolveM0OutputPath,
  runM0Focused,
  verifyM0Ledger,
} from '../../tools/test262/es2015-m0.js';
import {
  mergePromotionSubset,
  parseEs2015Promotion,
} from '../../tools/test262/es2015-promotion.js';
import {
  canonicalRoadmapAuthoritySha256,
  parseEs2015ProvenanceManifest,
} from '../../tools/test262/es2015-provenance.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);

export default [
  {
    name: 'M0 ledger parser rejects unsorted and duplicate Test262 roots',
    run() {
      assertSame(
        assertThrows(
          () => parseM0Ledger('test/b.js\ntest/a.js\n'),
          Error,
        ).message.includes('sorted unique'),
        true,
      );
      assertSame(
        assertThrows(
          () => parseM0Ledger('test/a.js\ntest/a.js\n'),
          Error,
        ).message.includes('sorted unique'),
        true,
      );
    },
  },
  {
    name: 'checked-in M0 ledger matches the exact current BASE selector',
    run: async () => {
      const [ledgerText, taxonomyText] = await Promise.all([
        readFile(
          new URL('tools/test262/es2015-m0-paths.txt', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/es2015-taxonomy.json', REPOSITORY_ROOT),
          'utf8',
        ),
      ]);
      const paths = verifyM0Ledger(ledgerText, JSON.parse(taxonomyText));

      assertSame(paths.length, M0.roots);
      assertSame(paths[0], 'test/built-ins/Array/from/not-a-constructor.js');
      assertSame(
        paths[paths.length - 1],
        'test/staging/sm/object/propertyIsEnumerable-proxy.js',
      );
    },
  },
  {
    name: 'generic promotion schema version 2 preserves the M0 subset group',
    run() {
      const promotion = parseEs2015Promotion(
        JSON.stringify({
          groupName: 'es2015/m0-object-internal-methods',
          version: 2,
          repository: 'https://github.com/tc39/test262.git',
          revision: '0123456789012345678901234567890123456789',
          sourceTaxonomySha256:
            '1111111111111111111111111111111111111111111111111111111111111111',
          ledgerSha256:
            '5472d68a25041c8d7c880b0ddeae071ba59771316434392f8aa8ecd7b2f7e964',
          rootCount: 1,
          variantCount: 2,
          entries: [
            {
              path: 'test/language/m0.js',
              variants: 2,
              features: ['Proxy'],
              includeFeatures: [],
            },
          ],
        }),
      );
      const merged = mergePromotionSubset(
        {
          version: 1,
          repository: promotion.repository,
          revision: promotion.revision,
          groups: [],
        },
        promotion,
      );

      assertSame(
        /** @type {any} */ (promotion).groupName,
        'es2015/m0-object-internal-methods',
      );
      assertSame(merged.groups.length, 1);
      assertSame(merged.groups[0].name, 'es2015/m0-object-internal-methods');
      assertSame(merged.groups[0].paths[0], 'test/language/m0.js');
    },
  },
  {
    name: 'generic promotion schema version 2 creates an empty exact promotion group',
    run() {
      const subset = {
        version: 1,
        repository: 'https://github.com/tc39/test262.git',
        revision: '0123456789012345678901234567890123456789',
        groups: [],
      };
      const promotion = parseEs2015Promotion(
        JSON.stringify({
          groupName: 'es2015/m0-object-internal-methods',
          version: 2,
          repository: subset.repository,
          revision: subset.revision,
          sourceTaxonomySha256:
            '1111111111111111111111111111111111111111111111111111111111111111',
          ledgerSha256:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          rootCount: 0,
          variantCount: 0,
          entries: [],
        }),
      );

      assertSame(promotion.rootCount, 0);
      assertSame(promotion.variantCount, 0);
      const merged = mergePromotionSubset(subset, promotion);
      assertSame(merged.groups.length, 1);
      assertSame(merged.groups[0].name, 'es2015/m0-object-internal-methods');
      assertSame(JSON.stringify(merged.groups[0].paths), '[]');
    },
  },
  {
    name: 'focused M0 runner executes every reviewed variant and no foreign root',
    run: async () => {
      const [ledgerText, taxonomyText] = await Promise.all([
        readFile(
          new URL('tools/test262/es2015-m0-paths.txt', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/es2015-taxonomy.json', REPOSITORY_ROOT),
          'utf8',
        ),
      ]);
      const taxonomy = JSON.parse(taxonomyText);
      const byPath = new Map(
        taxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const host = {
        readTest(/** @type {string} */ file) {
          const entry = byPath.get(file);
          if (entry === undefined) {
            throw new Error(`foreign path: ${file}`);
          }
          return [
            '/*---',
            'description: focused M0 runner fixture',
            `features: ${JSON.stringify(entry.features)}`,
            ...(entry.variants === 1 ? ['flags: [onlyStrict]'] : []),
            '---*/',
            '0;',
          ].join('\n');
        },
        readInclude() {
          return '';
        },
        readModule() {
          throw new Error('fixture does not use modules');
        },
      };
      const engine = {
        createRealm() {
          return {};
        },
        installHostBindings() {},
        evaluateScript() {
          return { type: 'normal', value: undefined };
        },
      };
      const document = await runM0Focused({
        environment: { TZ: 'UTC' },
        ledgerText,
        taxonomy,
        pin: taxonomy.pin,
        host,
        engine,
      });

      assertSame(Object.keys(document).join(','), 'version,ledger,records');
      assertSame(document.ledger.roots, 240);
      assertSame(document.ledger.variants, 459);
      assertSame(document.records.length, 459);
      assertSame(
        document.records.every((record) => record.status === 'passed'),
        true,
      );
    },
  },
  {
    name: 'focused M0 runner rejects non-UTC execution before reading Test262',
    run: async () => {
      let message = '';
      try {
        await runM0Focused({
          environment: { TZ: 'America/Los_Angeles' },
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('TZ=UTC'), true);
    },
  },
  {
    name: 'focused M0 output path cannot escape the repository',
    run: async () => {
      let message = '';
      try {
        await resolveM0OutputPath(REPOSITORY_ROOT, '../m0-output.json');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('outside the repository root'), true);
      assertSame(
        (
          await resolveM0OutputPath(
            REPOSITORY_ROOT,
            '.superpowers/issue-79/task-8/m0-output.json',
          )
        ).endsWith('/.superpowers/issue-79/task-8/m0-output.json'),
        true,
      );
    },
  },
  {
    name: 'M0 authority evidence uses the generic six-file schemas',
    run: async () => {
      const [ledgerText, taxonomyText] = await Promise.all([
        readFile(
          new URL('tools/test262/es2015-m0-paths.txt', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/es2015-taxonomy.json', REPOSITORY_ROOT),
          'utf8',
        ),
      ]);
      const taxonomy = JSON.parse(taxonomyText);
      const paths = parseM0Ledger(ledgerText);
      const byPath = new Map(
        taxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const records = paths.flatMap((file) => {
        const variants = byPath.get(file).variants;
        return (variants === 1 ? ['strict'] : ['non-strict', 'strict']).map(
          (variant) => ({
            type: 'test',
            file,
            variant,
            status: 'failed',
          }),
        );
      });
      const evidence = buildM0AuthorityEvidence({
        ledgerText,
        taxonomyText,
        execution: {
          version: 1,
          ledger: M0,
          records,
        },
        disposition: {
          destinations: paths.map((path) => ({
            path,
            status: 'blocked:proxy-and-reflect-metaobject',
            blocker: 'proxy-and-reflect-metaobject',
            issue: 81,
          })),
        },
      });

      assertSame(evidence.paths.length, 240);
      assertSame(evidence.baseline.length, 240);
      assertSame(evidence.disposition.destinations.length, 240);
      assertSame(evidence.ownerDeltas.length, 240);
      assertSame(evidence.ownerMap.length, 1);
      assertSame(evidence.ownerMap[0].issue, 81);
      assertSame(evidence.ownerMap[0].blocker, 'proxy-and-reflect-metaobject');
      assertSame(evidence.promotion.version, 2);
      assertSame(
        evidence.promotion.groupName,
        'es2015/m0-object-internal-methods',
      );
      assertSame(evidence.promotion.rootCount, 0);
      assertSame(evidence.promotion.variantCount, 0);
      assertSame(evidence.promotion.entries.length, 0);
    },
  },
  {
    name: 'M0 projection changes only exact reviewed taxonomy and audit roots',
    run: async () => {
      const [
        ledgerText,
        taxonomyText,
        auditEvidenceText,
        subsetText,
        reportText,
        conformanceText,
      ] = await Promise.all(
        [
          'tools/test262/es2015-m0-paths.txt',
          'tools/test262/es2015-taxonomy.json',
          'tools/test262/es2015-audit-evidence.json',
          'tools/test262/upstream-subset.json',
          'docs/test262-report.jsonl',
          'docs/conformance.md',
        ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
      );
      const baseAudit = JSON.parse(auditEvidenceText);
      const paths = parseM0Ledger(ledgerText);
      const execution = {
        version: 1,
        ledger: M0,
        records: paths.flatMap((file) =>
          baseAudit.auditRecords
            .filter((/** @type {any} */ record) => record.file === file)
            .map((/** @type {any} */ record) => ({
              type: 'test',
              file,
              variant: record.variant,
              status: 'failed',
            })),
        ),
      };
      const evidence = buildM0AuthorityEvidence({
        ledgerText,
        taxonomyText,
        execution,
        disposition: {
          destinations: paths.map((path) => ({
            path,
            status: 'blocked:proxy-and-reflect-metaobject',
            blocker: 'proxy-and-reflect-metaobject',
            issue: 81,
          })),
        },
      });
      const projected = projectM0AuthorityOutputs({
        taxonomyText,
        auditEvidenceText,
        subsetText,
        reportText,
        conformanceText,
        evidence,
        execution,
      });
      const projectedTaxonomy = JSON.parse(projected.taxonomyText);
      const projectedByPath = new Map(
        projectedTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const projectedAudit = JSON.parse(projected.auditEvidenceText);

      assertSame(
        paths.every(
          (path) =>
            projectedByPath.get(path).status ===
            'blocked:proxy-and-reflect-metaobject',
        ),
        true,
      );
      assertSame(
        projectedByPath.get(
          'test/built-ins/Function/internals/Construct/base-ctor-revoked-proxy-realm.js',
        ).status,
        'blocked:proxy-and-reflect-metaobject',
      );
      assertSame(
        projectedAudit.blockers[
          'test/built-ins/Array/from/not-a-constructor.js'
        ],
        'proxy-and-reflect-metaobject',
      );
      assertSame(projected.subsetText, subsetText);
      assertSame(projected.reportText, reportText);
      assertSame(projected.conformanceText, conformanceText);
    },
  },
  {
    name: 'roadmap authority destinations retain shared Reflect and Proxy ownership',
    run: async () => {
      const manifest = JSON.parse(
        await readFile(
          new URL('tools/test262/es2015-provenance.json', REPOSITORY_ROOT),
          'utf8',
        ),
      );
      manifest.roadmapAuthorities = [
        ...manifest.roadmapAuthorities,
        {
          code: 'M0',
          issue: 79,
          parentIssue: 70,
          state: 'pending',
          source: {
            baseTaxonomySha256:
              '1111111111111111111111111111111111111111111111111111111111111111',
            rootCount: 240,
            variantCount: 459,
            pathSha256: M0.sha256,
            entryLedgerSha256: null,
          },
          reconciliation: null,
          evidence: [],
          protectedOutputs: [],
          destinations: [
            {
              status: 'blocked',
              blocker: 'proxy-and-reflect-metaobject',
              issue: 80,
            },
            {
              status: 'blocked',
              blocker: 'proxy-and-reflect-metaobject',
              issue: 81,
            },
          ],
        },
      ].sort((left, right) =>
        left.code < right.code ? -1 : left.code > right.code ? 1 : 0,
      );
      const parsed = parseEs2015ProvenanceManifest(
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      const m0 = parsed.roadmapAuthorities.find(
        (/** @type {any} */ authority) => authority.code === 'M0',
      );

      assertSame(m0.destinations[0].blocker, 'proxy-and-reflect-metaobject');
      assertSame(m0.destinations[0].issue, 80);
      assertSame(m0.destinations[1].blocker, 'proxy-and-reflect-metaobject');
      assertSame(m0.destinations[1].issue, 81);
      assertSame(
        /^[0-9a-f]{64}$/u.test(canonicalRoadmapAuthoritySha256(m0)),
        true,
      );
      for (const [blocker, issue] of [
        ['reflect-metaobject', 80],
        ['proxy-metaobject', 81],
      ]) {
        assertThrows(
          () =>
            canonicalRoadmapAuthoritySha256({
              ...m0,
              destinations: [{ status: 'blocked', blocker, issue }],
            }),
          Error,
        );
      }
    },
  },
];
