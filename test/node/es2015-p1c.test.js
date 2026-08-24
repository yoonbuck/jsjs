import { readFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
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
