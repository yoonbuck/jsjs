import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';

const LEDGER_FILE = 'tools/test262/es2015-p1c-paths.txt';
const EXPECTED_SHA256 =
  'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5';

export default [
  {
    name: 'the durable P1C ledger exactly matches its reviewed source identity',
    run: async () => {
      const [ledgerText, taxonomyText] = await Promise.all([
        readFile(LEDGER_FILE, 'utf8'),
        readFile('tools/test262/es2015-taxonomy.json', 'utf8'),
      ]);
      const paths = ledgerText.endsWith('\n')
        ? ledgerText.slice(0, -1).split('\n')
        : ledgerText.split('\n');
      const taxonomy = JSON.parse(taxonomyText);
      validateP1cTaxonomyClassifications(taxonomy);
      const byPath = new Map(
        taxonomy.classifications.map((entry) => [entry.path, entry]),
      );

      assertSame(paths.length, 81);
      assertSame(new Set(paths).size, 81);
      assertSame(JSON.stringify(paths), JSON.stringify([...paths].sort()));
      assertSame(
        createHash('sha256').update(ledgerText).digest('hex'),
        EXPECTED_SHA256,
      );

      let variants = 0;
      for (const path of paths) {
        const entry = byPath.get(path);
        assertSame(entry?.partition, 'core', path);
        assertSame(
          entry?.status,
          'blocked:early-errors-and-declaration-instantiation',
          path,
        );
        assertSame(
          entry?.blocker,
          'early-errors-and-declaration-instantiation',
          path,
        );
        variants += entry.variants;
      }
      assertSame(variants, 161);
    },
  },
  {
    name: 'P1C taxonomy validation rejects non-array classifications',
    run: () => {
      const error = assertThrows(
        () => validateP1cTaxonomyClassifications({ classifications: null }),
        Error,
      );
      assertSame(
        error.message,
        'P1C taxonomy.classifications must be an array',
      );
    },
  },
  {
    name: 'P1C taxonomy validation rejects duplicate classification paths',
    run: () => {
      const error = assertThrows(
        () =>
          validateP1cTaxonomyClassifications({
            classifications: [
              {
                path: 'test/a.js',
                variants: 1,
                partition: 'core',
                status: 'selected-passing',
                blocker: null,
              },
              {
                path: 'test/a.js',
                variants: 2,
                partition: 'core',
                status: 'selected-passing',
                blocker: null,
              },
            ],
          }),
        Error,
      );
      assertSame(
        error.message,
        'P1C taxonomy.classifications repeats path test/a.js',
      );
    },
  },
  {
    name: 'P1C taxonomy validation rejects non-integer variant counts',
    run: () => {
      const error = assertThrows(
        () =>
          validateP1cTaxonomyClassifications({
            classifications: [
              {
                path: 'test/a.js',
                variants: 1.5,
                partition: 'core',
                status: 'selected-passing',
                blocker: null,
              },
            ],
          }),
        Error,
      );
      assertSame(
        error.message,
        'P1C taxonomy.classifications[0].variants must be a positive integer',
      );
    },
  },
];

/**
 * @param {unknown} taxonomy
 * @returns {void}
 */
function validateP1cTaxonomyClassifications(taxonomy) {
  if (
    typeof taxonomy !== 'object' ||
    taxonomy === null ||
    Array.isArray(taxonomy)
  ) {
    throw new Error('P1C taxonomy must be an object');
  }
  if (!Array.isArray(taxonomy.classifications)) {
    throw new Error('P1C taxonomy.classifications must be an array');
  }

  const paths = new Set();
  for (let index = 0; index < taxonomy.classifications.length; index += 1) {
    const entry = taxonomy.classifications[index];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(
        `P1C taxonomy.classifications[${index}] must be an object`,
      );
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new Error(
        `P1C taxonomy.classifications[${index}].path must be a nonempty string`,
      );
    }
    if (paths.has(entry.path)) {
      throw new Error(
        `P1C taxonomy.classifications repeats path ${entry.path}`,
      );
    }
    if (!Number.isInteger(entry.variants) || entry.variants <= 0) {
      throw new Error(
        `P1C taxonomy.classifications[${index}].variants must be a positive integer`,
      );
    }
    if (typeof entry.partition !== 'string') {
      throw new Error(
        `P1C taxonomy.classifications[${index}].partition must be a string`,
      );
    }
    if (typeof entry.status !== 'string') {
      throw new Error(
        `P1C taxonomy.classifications[${index}].status must be a string`,
      );
    }
    if (entry.blocker !== null && typeof entry.blocker !== 'string') {
      throw new Error(
        `P1C taxonomy.classifications[${index}].blocker must be a string or null`,
      );
    }

    paths.add(entry.path);
  }
}
