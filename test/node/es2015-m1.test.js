import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame, assertThrows } from '../harness/assert.js';
import * as m1Module from '../../tools/test262/es2015-m1.js';
import {
  M1,
  M1_PROMOTION_GROUP,
  M1_PROXY_PATHS,
  buildM1AuthorityEvidence,
  buildM1PendingAuthority,
  parseM1Ledger,
  projectM1CoreOutputs,
  resolveM1OutputPath,
  runM1Focused,
  verifyM1Ledger,
} from '../../tools/test262/es2015-m1.js';
import { parseEs2015Promotion } from '../../tools/test262/es2015-promotion.js';
import {
  canonicalRoadmapAuthoritySha256,
  roadmapAggregateProjectionSha256,
} from '../../tools/test262/es2015-provenance.js';
import { buildEs2015Inventory } from '../../tools/test262/es2015-taxonomy.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT);
const { structuredClone } = globalThis;
const M1_REPAIRED_BASE = '44c2a747ee544fb85403380f86dc6a0e126faceb';
const P1C_CONSUMER_BASE = '968c0124cc5c3d63a19c3f926ed7857dfb3333ce';
const M1_CONSTRUCTOR_INCLUDE_PATHS = Object.freeze([
  'test/built-ins/Reflect/apply/not-a-constructor.js',
  'test/built-ins/Reflect/construct/not-a-constructor.js',
  'test/built-ins/Reflect/defineProperty/not-a-constructor.js',
  'test/built-ins/Reflect/deleteProperty/not-a-constructor.js',
  'test/built-ins/Reflect/get/not-a-constructor.js',
  'test/built-ins/Reflect/getOwnPropertyDescriptor/not-a-constructor.js',
  'test/built-ins/Reflect/getPrototypeOf/not-a-constructor.js',
  'test/built-ins/Reflect/has/not-a-constructor.js',
  'test/built-ins/Reflect/isExtensible/not-a-constructor.js',
  'test/built-ins/Reflect/preventExtensions/not-a-constructor.js',
  'test/built-ins/Reflect/set/not-a-constructor.js',
  'test/built-ins/Reflect/setPrototypeOf/not-a-constructor.js',
]);
const M1_STALE_EXCLUSION_PATHS = Object.freeze([
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js',
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js',
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js',
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js',
  'test/staging/sm/Array/unshift-with-enumeration.js',
  'test/staging/sm/object/bug-1206700.js',
  'test/staging/sm/strict/primitive-assignment.js',
]);

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {string} path */
function readM1BaseText(path) {
  const result = spawnSync('git', ['show', `${M1_REPAIRED_BASE}:${path}`], {
    cwd: REPOSITORY_ROOT_PATH,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`M1 repaired BASE file is unavailable: ${path}`);
  }
  return result.stdout;
}

/** @param {string} path */
function readP1CConsumerBaseText(path) {
  const result = spawnSync('git', ['show', `${P1C_CONSUMER_BASE}:${path}`], {
    cwd: REPOSITORY_ROOT_PATH,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`P1C consumer BASE file is unavailable: ${path}`);
  }
  return result.stdout;
}

async function readM1Inputs() {
  const ledgerText = await readFile(
    new URL('tools/test262/es2015-m1-paths.txt', REPOSITORY_ROOT),
    'utf8',
  );
  return {
    ledgerText,
    taxonomy: JSON.parse(readM1BaseText('tools/test262/es2015-taxonomy.json')),
  };
}

/**
 * @param {string} ledgerText
 * @param {any} taxonomy
 */
function syntheticM1Inventory(ledgerText, taxonomy) {
  const paths = ledgerText.trimEnd().split('\n');
  const byPath = new Map(
    taxonomy.classifications.map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  return buildEs2015Inventory({
    roots: paths.map((path) => {
      const entry = byPath.get(path);
      if (entry === undefined) {
        throw new Error(`missing M1 inventory fixture: ${path}`);
      }
      return {
        path,
        metadata: {
          features: entry.features,
          flags: entry.flags,
          includes: entry.includes,
        },
      };
    }),
    includeDefinitions: syntheticM1IncludeDefinitions(),
  });
}

function syntheticM1IncludeDefinitions() {
  return new Map([
    ['compareArray.js', { features: [], includes: [] }],
    ['isConstructor.js', { features: ['Reflect.construct'], includes: [] }],
    ['propertyHelper.js', { features: [], includes: [] }],
  ]);
}

async function readM1ProjectionInputs() {
  const [ledgerText, featuresText] = await Promise.all(
    ['tools/test262/es2015-m1-paths.txt', 'tools/test262/features.json'].map(
      (file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8'),
    ),
  );
  return {
    ledgerText,
    taxonomyText: readM1BaseText('tools/test262/es2015-taxonomy.json'),
    auditEvidenceText: readM1BaseText(
      'tools/test262/es2015-audit-evidence.json',
    ),
    subsetText: readM1BaseText('tools/test262/upstream-subset.json'),
    reportText: readM1BaseText('docs/test262-report.jsonl'),
    conformanceText: readM1BaseText('docs/conformance.md'),
    featuresText,
    selectionText: readM1BaseText('tools/test262/es5-selection.json'),
  };
}

/**
 * @param {string} ledgerText
 * @param {any} taxonomy
 */
function syntheticM1Execution(ledgerText, taxonomy) {
  const paths = ledgerText.trimEnd().split('\n');
  const byPath = new Map(
    taxonomy.classifications.map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  const proxyPaths = new Set(M1_PROXY_PATHS);
  return {
    version: 1,
    ledger: {
      roots: 113,
      variants: 226,
      sha256:
        '65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4',
    },
    records: paths.flatMap((/** @type {string} */ file) => {
      const entry = byPath.get(file);
      if (entry?.variants !== 2) {
        throw new Error(`unexpected M1 fixture variants: ${file}`);
      }
      return ['non-strict', 'strict'].map((variant) => ({
        type: 'test',
        file,
        variant,
        status: proxyPaths.has(file) ? 'failed' : 'passed',
      }));
    }),
  };
}

/**
 * @param {{
 *   failProxy?: boolean,
 *   failPath?: string | null,
 * }} [options]
 */
async function runFixtureM1(options = {}) {
  const { ledgerText, taxonomy } = await readM1Inputs();
  const byPath = new Map(
    taxonomy.classifications.map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  const proxyPaths = new Set(M1_PROXY_PATHS);
  const failProxy = options.failProxy ?? true;
  const failPath = options.failPath ?? null;
  const host = {
    readTest(/** @type {string} */ file) {
      const entry = byPath.get(file);
      if (entry === undefined) {
        throw new Error(`foreign M1 fixture path: ${file}`);
      }
      const fails =
        (failProxy && proxyPaths.has(file)) || failPath === file
          ? 'M1_FIXTURE_FAILURE'
          : 'M1_FIXTURE_PASS';
      return [
        '/*---',
        'description: focused M1 runner fixture',
        `features: ${JSON.stringify(entry.features)}`,
        '---*/',
        fails,
      ].join('\n');
    },
    readInclude() {
      return '';
    },
    readModule() {
      throw new Error('M1 fixture does not use modules');
    },
  };
  const engine = {
    createRealm() {
      return {};
    },
    installHostBindings() {},
    evaluateScript(/** @type {any} */ _realm, /** @type {string} */ source) {
      return source.includes('M1_FIXTURE_FAILURE')
        ? { type: 'throw', value: 'expected Proxy residual' }
        : { type: 'normal', value: undefined };
    },
  };
  return runM1Focused({
    environment: { TZ: 'UTC' },
    ledgerText,
    taxonomy,
    pin: taxonomy.pin,
    host,
    engine,
  });
}

export default [
  {
    name: 'M1 constants and ledger parser match the reviewed Reflect corpus',
    run() {
      assertSame(M1.roots, 113);
      assertSame(M1.variants, 226);
      assertSame(
        M1.sha256,
        '65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4',
      );
      assertSame(M1_PROMOTION_GROUP, 'es2015/m1-reflect');
      assertSame(M1_PROXY_PATHS.length, 10);
      assertThrows(() => parseM1Ledger('test/b.js\ntest/a.js\n'), Error);
    },
  },
  {
    name: 'checked-in M1 ledger matches the exact blocked Reflect taxonomy',
    run: async () => {
      const { ledgerText, taxonomy } = await readM1Inputs();
      const paths = verifyM1Ledger(ledgerText, taxonomy);

      assertSame(paths.length, M1.roots);
      assertSame(paths[0], 'test/built-ins/Reflect/Symbol.toStringTag.js');
      assertSame(
        paths[paths.length - 1],
        'test/built-ins/Reflect/setPrototypeOf/setPrototypeOf.js',
      );

      const variantDrift = structuredClone(taxonomy);
      const first = variantDrift.classifications.find(
        (/** @type {any} */ entry) => entry.path === paths[0],
      );
      const second = variantDrift.classifications.find(
        (/** @type {any} */ entry) => entry.path === paths[1],
      );
      if (first === undefined || second === undefined) {
        throw new Error('missing M1 variant-drift fixtures');
      }
      first.variants = 1;
      second.variants = 3;
      assertSame(
        assertThrows(
          () => verifyM1Ledger(ledgerText, variantDrift),
          Error,
        ).message.includes('classification mismatch'),
        true,
      );
    },
  },
  {
    name: 'applied M1 execution reconstructs and validates the exact source taxonomy',
    run: async () => {
      const reconstruct = m1Module.reconstructAppliedM1SourceTaxonomy;
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
          'tools/test262/es2015-m1-paths.txt',
          'tools/test262/es2015-taxonomy.json',
          'tools/test262/es2015-m1-baseline.json',
          'tools/test262/es2015-m1-disposition.json',
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
      assertSame(verifyM1Ledger(ledgerText, source).length, M1.roots);
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
        'Focused M1 execution evidence does not match authority',
      );

      const disposition = JSON.parse(dispositionText);
      const sourcePath = disposition.destinations[0].path;
      const mismatched = JSON.parse(taxonomyText);
      const mismatchedEntry = mismatched.classifications.find(
        (/** @type {any} */ entry) => entry.path === sourcePath,
      );
      if (mismatchedEntry === undefined) {
        throw new Error('missing applied M1 taxonomy fixture');
      }
      mismatchedEntry.status =
        mismatchedEntry.status === 'selected-passing'
          ? 'blocked:proxy-and-reflect-metaobject'
          : 'selected-passing';
      mismatchedEntry.blocker =
        mismatchedEntry.status === 'selected-passing'
          ? null
          : 'proxy-and-reflect-metaobject';
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              taxonomyText: `${JSON.stringify(mismatched, null, 2)}\n`,
            }),
          Error,
        ).message,
        `Focused M1 applied taxonomy mismatch: ${sourcePath}`,
      );

      const drifted = JSON.parse(taxonomyText);
      const driftedEntry = drifted.classifications.find(
        (/** @type {any} */ entry) => entry.path === sourcePath,
      );
      if (driftedEntry === undefined) {
        throw new Error('missing applied M1 taxonomy fixture');
      }
      driftedEntry.provenance = [
        ...driftedEntry.provenance,
        'foreign-m1-drift',
      ];
      assertSame(
        assertThrows(
          () =>
            reconstruct({
              ...options,
              taxonomyText: `${JSON.stringify(drifted, null, 2)}\n`,
            }),
          Error,
        ).message,
        `Focused M1 applied taxonomy drift: ${sourcePath}`,
      );
    },
  },
  {
    name: 'focused M1 runner executes only the reviewed outcome',
    run: async () => {
      const document = await runFixtureM1();
      const byPath = new Map();
      for (const record of document.records) {
        const records = byPath.get(record.file) ?? [];
        records.push(record);
        byPath.set(record.file, records);
      }
      const complete = [...byPath]
        .filter(([, records]) =>
          records.every(
            (/** @type {any} */ record) => record.status === 'passed',
          ),
        )
        .map(([path]) => path);
      const residual = [...byPath]
        .filter(([, records]) =>
          records.some(
            (/** @type {any} */ record) => record.status !== 'passed',
          ),
        )
        .map(([path]) => path);

      assertSame(Object.keys(document).join(','), 'version,ledger,records');
      assertSame(document.ledger.roots, 113);
      assertSame(document.ledger.variants, 226);
      assertSame(document.records.length, 226);
      assertSame(complete.length, 103);
      assertSame(residual.length, 10);
      assertSame(residual.join('\n'), M1_PROXY_PATHS.join('\n'));
    },
  },
  {
    name: 'focused M1 runner rejects non-UTC execution before reading Test262',
    run: async () => {
      let message = '';
      try {
        await runM1Focused({
          environment: { TZ: 'America/Los_Angeles' },
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('TZ=UTC'), true);
    },
  },
  {
    name: 'focused M1 runner rejects a complete Proxy pass',
    run: async () => {
      let message = '';
      try {
        await runFixtureM1({ failProxy: false });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('Proxy residual unexpectedly passed'), true);
    },
  },
  {
    name: 'focused M1 runner rejects a non-Proxy failure',
    run: async () => {
      let message = '';
      try {
        await runFixtureM1({
          failPath: 'test/built-ins/Reflect/apply/apply.js',
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(
        message.includes('Reflect root did not completely pass'),
        true,
      );
    },
  },
  {
    name: 'focused M1 output path cannot escape the repository',
    run: async () => {
      let message = '';
      try {
        await resolveM1OutputPath(REPOSITORY_ROOT, '../m1-output.json');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      assertSame(message.includes('outside the repository root'), true);
      assertSame(
        (
          await (async () => {
            try {
              await resolveM1OutputPath(
                REPOSITORY_ROOT,
                'tools/test262/es2015-taxonomy.json',
              );
              return '';
            } catch (error) {
              return error instanceof Error ? error.message : String(error);
            }
          })()
        ).includes('.superpowers/issue-80/m1'),
        true,
      );
      assertSame(
        (
          await resolveM1OutputPath(
            REPOSITORY_ROOT,
            '.superpowers/issue-80/m1/execution.json',
          )
        ).endsWith('/.superpowers/issue-80/m1/execution.json'),
        true,
      );

      const linkPath = '.superpowers/issue-80/m1/protected-output-link.json';
      const linkUrl = new URL(linkPath, REPOSITORY_ROOT);
      await rm(linkUrl, { force: true });
      await symlink(
        '../../../tools/test262/es2015-taxonomy.json',
        linkUrl,
        'file',
      );
      try {
        let linkMessage = '';
        try {
          await resolveM1OutputPath(REPOSITORY_ROOT, linkPath);
        } catch (error) {
          linkMessage = error instanceof Error ? error.message : String(error);
        }
        assertSame(linkMessage.includes('outside the M1 scratch root'), true);
      } finally {
        await rm(linkUrl, { force: true });
      }
    },
  },
  {
    name: 'M1 authority evidence uses the generic six-file schemas',
    run: async () => {
      const { ledgerText, taxonomy } = await readM1Inputs();
      const taxonomyText = `${JSON.stringify(taxonomy, null, 2)}\n`;
      const inventory = syntheticM1Inventory(ledgerText, taxonomy);
      const evidence = buildM1AuthorityEvidence({
        ledgerText,
        taxonomyText,
        execution: syntheticM1Execution(ledgerText, taxonomy),
        inventory,
      });

      assertSame(evidence.paths.length, 113);
      assertSame(evidence.baseline.length, 113);
      assertSame(evidence.disposition.destinations.length, 113);
      assertSame(evidence.ownerDeltas.length, 10);
      assertSame(evidence.ownerMap.length, 1);
      assertSame(evidence.ownerMap[0].status, 'blocked');
      assertSame(evidence.ownerMap[0].blocker, 'proxy-and-reflect-metaobject');
      assertSame(evidence.ownerMap[0].issue, 81);
      assertSame(evidence.promotion.version, 2);
      assertSame(evidence.promotion.groupName, 'es2015/m1-reflect');
      assertSame(evidence.promotion.rootCount, 103);
      assertSame(evidence.promotion.variantCount, 206);
      assertSame(
        evidence.promotion.entries.filter(
          (entry) => entry.includeFeatures.length > 0,
        ).length,
        12,
      );
      assertSame(
        evidence.promotion.entries.every((entry) =>
          M1_CONSTRUCTOR_INCLUDE_PATHS.includes(entry.path)
            ? JSON.stringify(entry.includeFeatures) === '["Reflect.construct"]'
            : entry.includeFeatures.length === 0,
        ),
        true,
      );
      assertSame(
        JSON.stringify(m1Module.M1_CONSTRUCTOR_INCLUDE_PATHS),
        JSON.stringify(M1_CONSTRUCTOR_INCLUDE_PATHS),
      );
      assertSame(
        parseEs2015Promotion(JSON.stringify(evidence.promotion)).entries.length,
        103,
      );
      assertSame(
        sha256(`${JSON.stringify(evidence.promotion, null, 2)}\n`),
        '31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69',
      );
    },
  },
  {
    name: 'M1 authority evidence rejects pinned inventory drift',
    run: async () => {
      const { ledgerText, taxonomy } = await readM1Inputs();
      const taxonomyText = `${JSON.stringify(taxonomy, null, 2)}\n`;
      const execution = syntheticM1Execution(ledgerText, taxonomy);
      const inventory = syntheticM1Inventory(ledgerText, taxonomy);
      const drifted = /** @type {any[]} */ (structuredClone(inventory));
      const constructorRoot = drifted.find(
        (/** @type {any} */ entry) =>
          entry.path === M1_CONSTRUCTOR_INCLUDE_PATHS[0],
      );
      if (constructorRoot === undefined) {
        throw new Error('missing M1 constructor inventory fixture');
      }
      if (constructorRoot.metadata === null) {
        throw new Error('missing M1 constructor metadata fixture');
      }
      constructorRoot.metadata.features = [];

      assertSame(
        assertThrows(
          () =>
            buildM1AuthorityEvidence({
              ledgerText,
              taxonomyText,
              execution,
              inventory: drifted,
            }),
          Error,
        ).message.includes(
          `M1 pinned inventory drift: ${constructorRoot.path}`,
        ),
        true,
      );
    },
  },
  {
    name: 'M1 authority evidence rejects execution and disposition drift',
    run: async () => {
      const { ledgerText, taxonomy } = await readM1Inputs();
      const taxonomyText = `${JSON.stringify(taxonomy, null, 2)}\n`;
      const baselineExecution = syntheticM1Execution(ledgerText, taxonomy);
      const inventory = syntheticM1Inventory(ledgerText, taxonomy);
      const expectRejected = (/** @type {any} */ execution) =>
        assertThrows(
          () =>
            buildM1AuthorityEvidence({
              ledgerText,
              taxonomyText,
              execution,
              inventory,
            }),
          Error,
        );

      const nonProxyFailure = structuredClone(baselineExecution);
      const nonProxyRecord = nonProxyFailure.records.find(
        (/** @type {any} */ record) =>
          record.file === 'test/built-ins/Reflect/apply/apply.js',
      );
      if (nonProxyRecord === undefined) {
        throw new Error('missing non-Proxy M1 fixture record');
      }
      nonProxyRecord.status = 'failed';
      assertSame(
        expectRejected(nonProxyFailure).message.includes(
          'Reflect root did not completely pass',
        ),
        true,
      );

      const proxyPass = structuredClone(baselineExecution);
      for (const record of proxyPass.records.filter(
        (/** @type {any} */ entry) => entry.file === M1_PROXY_PATHS[0],
      )) {
        record.status = 'passed';
      }
      assertSame(
        expectRejected(proxyPass).message.includes(
          'Proxy residual unexpectedly passed',
        ),
        true,
      );

      const partial = structuredClone(baselineExecution);
      partial.records.pop();
      assertSame(
        expectRejected(partial).message.includes('exact variants'),
        true,
      );

      const skippedProxy = structuredClone(baselineExecution);
      const skippedRecord = skippedProxy.records.find(
        (/** @type {any} */ record) =>
          record.file === M1_PROXY_PATHS[0] && record.variant === 'non-strict',
      );
      if (skippedRecord === undefined) {
        throw new Error('missing skipped Proxy fixture record');
      }
      skippedRecord.status = 'skipped';
      assertSame(
        expectRejected(skippedProxy).message.includes('skipped'),
        true,
      );

      const foreign = structuredClone(baselineExecution);
      foreign.records[0].file = 'test/built-ins/Reflect/foreign.js';
      assertSame(
        expectRejected(foreign).message.includes('foreign or duplicate'),
        true,
      );

      const paths = ledgerText.trimEnd().split('\n');
      const proxySet = new Set(M1_PROXY_PATHS);
      const wrongDisposition = {
        destinations: paths.map((path) =>
          proxySet.has(path)
            ? {
                path,
                status: 'blocked:proxy-and-reflect-metaobject',
                blocker: 'proxy-and-reflect-metaobject',
                issue: 80,
              }
            : {
                path,
                status: 'selected-passing',
                blocker: null,
                issue: 80,
              },
        ),
      };
      assertSame(
        assertThrows(
          () =>
            buildM1AuthorityEvidence({
              ledgerText,
              taxonomyText,
              execution: baselineExecution,
              inventory,
              disposition: wrongDisposition,
            }),
          Error,
        ).message.includes('disposition'),
        true,
      );
    },
  },
  {
    name: 'M1 core projection changes only reviewed source and generated bytes',
    run: async () => {
      const inputs = await readM1ProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const execution = syntheticM1Execution(inputs.ledgerText, taxonomy);
      const inventory = syntheticM1Inventory(inputs.ledgerText, taxonomy);
      const evidence = buildM1AuthorityEvidence({
        ledgerText: inputs.ledgerText,
        taxonomyText: inputs.taxonomyText,
        execution,
        inventory,
      });
      const projected = projectM1CoreOutputs({
        ...inputs,
        evidence,
        execution,
        inventory,
      });
      const repeated = projectM1CoreOutputs({
        ...inputs,
        evidence,
        execution,
        inventory,
      });

      assertSame(
        Object.keys(projected).join(','),
        'taxonomyText,auditEvidenceText,subsetText,reportText,conformanceText',
      );
      assertSame(JSON.stringify(projected), JSON.stringify(repeated));

      const sourcePaths = new Set(evidence.paths);
      const baseAudit = JSON.parse(inputs.auditEvidenceText);
      const headAudit = JSON.parse(projected.auditEvidenceText);
      const headM1Records = headAudit.auditRecords.filter(
        (/** @type {any} */ record) => sourcePaths.has(record.file),
      );
      assertSame(headM1Records.length, 226);
      assertSame(
        headM1Records.filter(
          (/** @type {any} */ record) => record.status === 'passed',
        ).length,
        206,
      );
      assertSame(
        headM1Records.filter(
          (/** @type {any} */ record) => record.status === 'failed',
        ).length,
        20,
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
        evidence.promotion.entries.every(
          (/** @type {any} */ entry) =>
            !Object.prototype.hasOwnProperty.call(
              headAudit.blockers,
              entry.path,
            ),
        ),
        true,
      );
      assertSame(
        M1_PROXY_PATHS.every(
          (path) => headAudit.blockers[path] === 'proxy-and-reflect-metaobject',
        ),
        true,
      );

      const headTaxonomy = JSON.parse(projected.taxonomyText);
      const baseByPath = new Map(
        taxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      let selectedRoots = 0;
      let blockedRoots = 0;
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
        if (entry.status === 'selected-passing') selectedRoots += 1;
        if (
          entry.status === 'blocked:proxy-and-reflect-metaobject' &&
          entry.blocker === 'proxy-and-reflect-metaobject'
        ) {
          blockedRoots += 1;
        }
      }
      assertSame(selectedRoots, 103);
      assertSame(blockedRoots, 10);

      const subset = JSON.parse(projected.subsetText);
      const groups = subset.groups.filter(
        (/** @type {any} */ group) => group.name === 'es2015/m1-reflect',
      );
      assertSame(groups.length, 1);
      assertSame(groups[0].paths.length, 103);
      assertSame(subset.groups.length, 61);
      assertSame(
        new Set(
          subset.groups.flatMap((/** @type {any} */ group) => group.paths),
        ).size,
        20595,
      );
      assertSame(
        sha256(projected.subsetText),
        '9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0',
      );
      assertSame(
        sha256(projected.taxonomyText),
        'fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a',
      );
      assertSame(
        sha256(projected.auditEvidenceText),
        'eabaeb8245a6988443d91b21219c9e7919ec22639d6e8515a8dadbe5ddfc217f',
      );
      assertSame(
        sha256(projected.reportText),
        'ead91d3f6c0f23f8cfbe839bef3e371539e5f8fa590b9b351570714ce740e5c8',
      );
      assertSame(
        sha256(projected.conformanceText),
        '61ed7a18ff9d77c9b0b3e5d4c598ce30e998d633be88bb1bc101c650aee65169',
      );

      const reportRecords = projected.reportText
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
      const reportM1 = reportRecords.filter(
        (/** @type {any} */ record) =>
          record.type === 'test' && sourcePaths.has(record.file),
      );
      const promotionByPath = new Map(
        evidence.promotion.entries.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      assertSame(reportM1.length, 206);
      assertSame(
        reportM1.every((/** @type {any} */ record) => {
          const promotion = promotionByPath.get(record.file);
          return (
            record.status === 'passed' &&
            promotion !== undefined &&
            JSON.stringify(record.features) ===
              JSON.stringify(promotion.features)
          );
        }),
        true,
      );
      assertSame(
        reportM1.some((/** @type {any} */ record) =>
          M1_PROXY_PATHS.includes(record.file),
        ),
        false,
      );

      const stripCoverage = (/** @type {string} */ text) =>
        text.replace(
          /<!-- test262-coverage:begin -->[\s\S]*?<!-- test262-coverage:end -->/u,
          '<!-- test262-coverage:begin --><!-- test262-coverage:end -->',
        );
      assertSame(
        stripCoverage(projected.conformanceText),
        stripCoverage(inputs.conformanceText),
      );
    },
  },
  {
    name: 'M1 selection projection removes exactly seven stale exclusions',
    run: async () => {
      const { selectionText } = await readM1ProjectionInputs();
      const projectM1Selection = m1Module.projectM1Selection;
      assertSame(typeof projectM1Selection, 'function');
      if (typeof projectM1Selection !== 'function') return;
      const projection = projectM1Selection(selectionText);
      const base = JSON.parse(projection.baseText);
      const head = JSON.parse(projection.headText);
      const removed = base.exclusions.filter((/** @type {any} */ entry) =>
        M1_STALE_EXCLUSION_PATHS.includes(entry.path),
      );
      const expected = {
        ...base,
        exclusions: base.exclusions.filter(
          (/** @type {any} */ entry) =>
            !M1_STALE_EXCLUSION_PATHS.includes(entry.path),
        ),
      };

      assertSame(projection.baseText, selectionText);
      assertSame(removed.length, 7);
      assertSame(
        JSON.stringify(removed.map((/** @type {any} */ entry) => entry.path)),
        JSON.stringify(M1_STALE_EXCLUSION_PATHS),
      );
      assertSame(JSON.stringify(head), JSON.stringify(expected));
      assertSame(
        JSON.stringify(m1Module.M1_STALE_EXCLUSION_PATHS),
        JSON.stringify(M1_STALE_EXCLUSION_PATHS),
      );
      assertSame(
        sha256(projection.baseText),
        '533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8',
      );
      assertSame(
        sha256(projection.headText),
        '78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df',
      );
    },
  },
  {
    name: 'M1 pending authority pins six evidence files and closed projections',
    run: async () => {
      const inputs = await readM1ProjectionInputs();
      const taxonomy = JSON.parse(inputs.taxonomyText);
      const execution = syntheticM1Execution(inputs.ledgerText, taxonomy);
      const inventory = syntheticM1Inventory(inputs.ledgerText, taxonomy);
      const evidence = buildM1AuthorityEvidence({
        ledgerText: inputs.ledgerText,
        taxonomyText: inputs.taxonomyText,
        execution,
        inventory,
      });
      const projected = projectM1CoreOutputs({
        ...inputs,
        evidence,
        execution,
        inventory,
      });
      const projectM1Selection = m1Module.projectM1Selection;
      if (typeof projectM1Selection !== 'function') {
        throw new Error('M1 selection projection is unavailable');
      }
      const selection = projectM1Selection(inputs.selectionText);
      const render = (/** @type {unknown} */ value) =>
        `${JSON.stringify(value, null, 2)}\n`;
      const authority = buildM1PendingAuthority({
        baseTaxonomyText: inputs.taxonomyText,
        evidenceTexts: {
          'tools/test262/es2015-m1-paths.json': render(evidence.paths),
          'tools/test262/es2015-m1-baseline.json': render(evidence.baseline),
          'tools/test262/es2015-m1-disposition.json': render(
            evidence.disposition,
          ),
          'tools/test262/es2015-m1-owner-deltas.json': render(
            evidence.ownerDeltas,
          ),
          'tools/test262/es2015-m1-owner-map.json': render(evidence.ownerMap),
          'tools/test262/es2015-m1-promotion.json': render(evidence.promotion),
        },
        baseOutputs: {
          'docs/conformance.md': inputs.conformanceText,
          'docs/test262-report.jsonl': inputs.reportText,
          'tools/test262/es2015-audit-evidence.json': inputs.auditEvidenceText,
          'tools/test262/es2015-taxonomy.json': inputs.taxonomyText,
          'tools/test262/es5-selection.json': selection.baseText,
          'tools/test262/upstream-subset.json': inputs.subsetText,
        },
        projectedOutputs: {
          'docs/conformance.md': projected.conformanceText,
          'docs/test262-report.jsonl': projected.reportText,
          'tools/test262/es2015-audit-evidence.json':
            projected.auditEvidenceText,
          'tools/test262/es2015-taxonomy.json': projected.taxonomyText,
          'tools/test262/es5-selection.json': selection.headText,
          'tools/test262/upstream-subset.json': projected.subsetText,
        },
      });

      assertSame(authority.code, 'M1');
      assertSame(authority.issue, 80);
      assertSame(authority.parentIssue, 70);
      assertSame(authority.state, 'pending');
      assertSame(authority.source.rootCount, 113);
      assertSame(authority.source.variantCount, 226);
      assertSame(
        authority.source.pathSha256,
        '65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4',
      );
      assertSame(authority.source.entryLedgerSha256, null);
      assertSame(authority.reconciliation, null);
      assertSame(authority.evidence.length, 6);
      assertSame(authority.protectedOutputs.length, 12);
      assertSame(
        authority.protectedOutputs.filter(
          (/** @type {any} */ output) => output.operation === 'add-exact',
        ).length,
        6,
      );
      assertSame(
        authority.protectedOutputs.filter(
          (/** @type {any} */ output) => output.operation === 'replace-exact',
        ).length,
        2,
      );
      assertSame(
        authority.protectedOutputs.filter(
          (/** @type {any} */ output) => output.operation === 'project',
        ).length,
        4,
      );
      assertSame(
        authority.protectedOutputs.every((/** @type {any} */ output) =>
          [output.baseSha256, output.headSha256, output.projectionSha256]
            .filter((value) => value !== null)
            .every((value) => /^[0-9a-f]{64}$/u.test(value)),
        ),
        true,
      );
      const selectionOutput = authority.protectedOutputs.find(
        (/** @type {any} */ output) =>
          output.path === 'tools/test262/es5-selection.json',
      );
      assertSame(
        JSON.stringify(selectionOutput),
        JSON.stringify({
          path: 'tools/test262/es5-selection.json',
          operation: 'replace-exact',
          baseSha256:
            '533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8',
          headSha256:
            '78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df',
          projectionSha256: null,
        }),
      );
      assertSame(
        sha256(`${JSON.stringify(authority)}\n`),
        '42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670',
      );
      assertSame(
        sha256(render(authority)),
        '08bee7fc33f94ce6eaa5527aa5e6ee5c90432fd4cce364e853d1cf1bfe1bf570',
      );
      const protectedProjection = authority.protectedOutputs.map((output) => ({
        path: output.path,
        operation: output.operation,
        sha256:
          output.operation === 'project'
            ? output.projectionSha256
            : output.headSha256,
      }));
      assertSame(
        sha256(`${JSON.stringify(protectedProjection)}\n`),
        '22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed',
      );
      const manifest = JSON.parse(
        await readFile(
          new URL('tools/test262/es2015-provenance.json', REPOSITORY_ROOT),
          'utf8',
        ),
      );
      const repaired = manifest.roadmapAuthorities.find(
        (/** @type {any} */ entry) => entry.code === 'M1',
      );
      const appliedAuthority = structuredClone(authority);
      appliedAuthority.state = 'applied';
      assertSame(JSON.stringify(appliedAuthority), JSON.stringify(repaired));
      assertSame(
        JSON.stringify(authority.destinations),
        JSON.stringify([
          {
            status: 'blocked',
            blocker: 'proxy-and-reflect-metaobject',
            issue: 81,
          },
          {
            status: 'selected-passing',
            blocker: null,
            issue: 80,
          },
        ]),
      );
    },
  },
  {
    name: 'tracked M1 evidence reproduces the exact corrected applied projection',
    run: async () => {
      const [
        ledgerText,
        taxonomyText,
        auditEvidenceText,
        subsetText,
        reportText,
        conformanceText,
        featuresText,
        selectionText,
        pathsText,
        baselineText,
        dispositionText,
        ownerDeltasText,
        ownerMapText,
        promotionText,
        provenanceText,
      ] = await Promise.all(
        [
          'tools/test262/es2015-m1-paths.txt',
          'tools/test262/es2015-taxonomy.json',
          'tools/test262/es2015-audit-evidence.json',
          'tools/test262/upstream-subset.json',
          'docs/test262-report.jsonl',
          'docs/conformance.md',
          'tools/test262/features.json',
          'tools/test262/es5-selection.json',
          'tools/test262/es2015-m1-paths.json',
          'tools/test262/es2015-m1-baseline.json',
          'tools/test262/es2015-m1-disposition.json',
          'tools/test262/es2015-m1-owner-deltas.json',
          'tools/test262/es2015-m1-owner-map.json',
          'tools/test262/es2015-m1-promotion.json',
          'tools/test262/es2015-provenance.json',
        ].map((file) => readFile(new URL(file, REPOSITORY_ROOT), 'utf8')),
      );
      const sourceTaxonomyText = readM1BaseText(
        'tools/test262/es2015-taxonomy.json',
      );
      const sourceAuditEvidenceText = readM1BaseText(
        'tools/test262/es2015-audit-evidence.json',
      );
      const sourceSubsetText = readM1BaseText(
        'tools/test262/upstream-subset.json',
      );
      const sourceReportText = readM1BaseText('docs/test262-report.jsonl');
      const sourceConformanceText = readM1BaseText('docs/conformance.md');
      const sourceSelectionText = readM1BaseText(
        'tools/test262/es5-selection.json',
      );
      const sourceTaxonomy = JSON.parse(sourceTaxonomyText);
      const sourcePaths = new Set(JSON.parse(pathsText));
      const execution = {
        version: 1,
        ledger: M1,
        records: JSON.parse(auditEvidenceText).auditRecords.filter(
          (/** @type {any} */ record) => sourcePaths.has(record.file),
        ),
      };
      assertSame(execution.records.length, 226);
      const inventory = syntheticM1Inventory(ledgerText, sourceTaxonomy);
      const evidence = buildM1AuthorityEvidence({
        ledgerText,
        taxonomyText: sourceTaxonomyText,
        execution,
        inventory,
      });
      const render = (/** @type {unknown} */ value) =>
        `${JSON.stringify(value, null, 2)}\n`;
      /** @type {Record<string, string>} */
      const evidenceTexts = {
        'tools/test262/es2015-m1-paths.json': render(evidence.paths),
        'tools/test262/es2015-m1-baseline.json': render(evidence.baseline),
        'tools/test262/es2015-m1-disposition.json': render(
          evidence.disposition,
        ),
        'tools/test262/es2015-m1-owner-deltas.json': render(
          evidence.ownerDeltas,
        ),
        'tools/test262/es2015-m1-owner-map.json': render(evidence.ownerMap),
        'tools/test262/es2015-m1-promotion.json': render(evidence.promotion),
      };
      /** @type {Record<string, string>} */
      const trackedEvidenceTexts = {
        'tools/test262/es2015-m1-paths.json': pathsText,
        'tools/test262/es2015-m1-baseline.json': baselineText,
        'tools/test262/es2015-m1-disposition.json': dispositionText,
        'tools/test262/es2015-m1-owner-deltas.json': ownerDeltasText,
        'tools/test262/es2015-m1-owner-map.json': ownerMapText,
        'tools/test262/es2015-m1-promotion.json': promotionText,
      };
      for (const [path, text] of Object.entries(evidenceTexts)) {
        assertSame(text, trackedEvidenceTexts[path]);
      }

      const projected = projectM1CoreOutputs({
        taxonomyText: sourceTaxonomyText,
        auditEvidenceText: sourceAuditEvidenceText,
        subsetText: sourceSubsetText,
        reportText: sourceReportText,
        conformanceText: sourceConformanceText,
        featuresText,
        evidence,
        execution,
        inventory,
      });
      const projectM1Selection = m1Module.projectM1Selection;
      if (typeof projectM1Selection !== 'function') {
        throw new Error('M1 selection projection is unavailable');
      }
      const selection = projectM1Selection(sourceSelectionText);
      assertSame(
        projected.taxonomyText,
        readP1CConsumerBaseText('tools/test262/es2015-taxonomy.json'),
      );
      assertSame(
        projected.auditEvidenceText,
        readP1CConsumerBaseText('tools/test262/es2015-audit-evidence.json'),
      );
      assertSame(
        projected.subsetText,
        readP1CConsumerBaseText('tools/test262/upstream-subset.json'),
      );
      assertSame(
        projected.reportText,
        readP1CConsumerBaseText('docs/test262-report.jsonl'),
      );
      assertSame(
        projected.conformanceText,
        readP1CConsumerBaseText('docs/conformance.md'),
      );
      assertSame(selection.headText, selectionText);
      const subset = JSON.parse(subsetText);
      assertSame(subset.groups.length, 62);
      assertSame(
        new Set(
          subset.groups.flatMap((/** @type {any} */ group) => group.paths),
        ).size,
        20672,
      );
      const currentTaxonomy = JSON.parse(taxonomyText);
      const projectedTaxonomy = JSON.parse(projected.taxonomyText);
      const currentByPath = new Map(
        currentTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      const projectedByPath = new Map(
        projectedTaxonomy.classifications.map((/** @type {any} */ entry) => [
          entry.path,
          entry,
        ]),
      );
      for (const path of sourcePaths) {
        assertSame(
          JSON.stringify(currentByPath.get(path)),
          JSON.stringify(projectedByPath.get(path)),
          path,
        );
      }
      const currentReport = reportText
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter(
          (/** @type {any} */ record) =>
            record.type === 'test' && sourcePaths.has(record.file),
        );
      const projectedReport = projected.reportText
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter(
          (/** @type {any} */ record) =>
            record.type === 'test' && sourcePaths.has(record.file),
        );
      assertSame(
        JSON.stringify(currentReport),
        JSON.stringify(projectedReport),
      );
      const stripCoverage = (/** @type {string} */ text) =>
        text.replace(
          /<!-- test262-coverage:begin -->[\s\S]*?<!-- test262-coverage:end -->/u,
          '<!-- test262-coverage:begin --><!-- test262-coverage:end -->',
        );
      assertSame(
        stripCoverage(conformanceText),
        stripCoverage(projected.conformanceText),
      );

      const pendingAuthority = buildM1PendingAuthority({
        baseTaxonomyText: sourceTaxonomyText,
        evidenceTexts,
        baseOutputs: {
          'docs/conformance.md': sourceConformanceText,
          'docs/test262-report.jsonl': sourceReportText,
          'tools/test262/es2015-audit-evidence.json': sourceAuditEvidenceText,
          'tools/test262/es2015-taxonomy.json': sourceTaxonomyText,
          'tools/test262/es5-selection.json': sourceSelectionText,
          'tools/test262/upstream-subset.json': sourceSubsetText,
        },
        projectedOutputs: {
          'docs/conformance.md': projected.conformanceText,
          'docs/test262-report.jsonl': projected.reportText,
          'tools/test262/es2015-audit-evidence.json':
            projected.auditEvidenceText,
          'tools/test262/es2015-taxonomy.json': projected.taxonomyText,
          'tools/test262/es5-selection.json': selection.headText,
          'tools/test262/upstream-subset.json': projected.subsetText,
        },
      });
      const manifest = JSON.parse(provenanceText);
      const trackedAuthority = manifest.roadmapAuthorities.find(
        (/** @type {any} */ entry) => entry.code === 'M1',
      );
      if (trackedAuthority === undefined) {
        throw new Error('missing tracked M1 roadmap authority');
      }
      const appliedAuthority = structuredClone(pendingAuthority);
      appliedAuthority.state = 'applied';
      assertSame(
        JSON.stringify(appliedAuthority),
        JSON.stringify(trackedAuthority),
      );
      assertSame(trackedAuthority.state, 'applied');
      assertSame(trackedAuthority.protectedOutputs.length, 12);
      assertSame(
        canonicalRoadmapAuthoritySha256(pendingAuthority),
        '42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670',
      );
      assertSame(
        roadmapAggregateProjectionSha256(trackedAuthority),
        '22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed',
      );
      assertSame(
        sha256(promotionText),
        '31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69',
      );
      assertSame(
        sha256(projected.taxonomyText),
        'fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a',
      );
      assertSame(
        sha256(selectionText),
        '78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df',
      );
    },
  },
];
