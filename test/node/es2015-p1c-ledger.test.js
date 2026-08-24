import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';

/**
 * @typedef {{
 *   path: string,
 *   variants: number,
 *   partition: 'core',
 *   status: 'blocked:early-errors-and-declaration-instantiation',
 *   blocker: 'early-errors-and-declaration-instantiation',
 *   features: readonly string[],
 *   flags: readonly string[],
 *   includes: readonly string[],
 *   provenance: readonly string[],
 * }} P1cBaselineClassification
 * @typedef {readonly P1cBaselineClassification[]} P1cBaseline
 */

const LEDGER_FILE = 'tools/test262/es2015-p1c-paths.txt';
const BASELINE_FILE = 'tools/test262/es2015-p1c-baseline.json';
const EXPECTED_SHA256 =
  'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5';

export default [
  {
    name: 'the durable P1C ledger exactly matches its reviewed source identity',
    run: async () => {
      const [ledgerText, baselineText] = await Promise.all([
        readFile(LEDGER_FILE, 'utf8'),
        readFile(BASELINE_FILE, 'utf8'),
      ]);
      const paths = ledgerText.endsWith('\n')
        ? ledgerText.slice(0, -1).split('\n')
        : ledgerText.split('\n');
      const baseline = validateP1CBaseline(JSON.parse(baselineText));
      const baselinePaths = baseline.map((entry) => entry.path);
      const byPath = new Map(baseline.map((entry) => [entry.path, entry]));

      assertSame(paths.length, 81);
      assertSame(new Set(paths).size, 81);
      assertSame(JSON.stringify(paths), JSON.stringify([...paths].sort()));
      assertSame(JSON.stringify(baselinePaths), JSON.stringify(paths));
      assertSame(
        createHash('sha256').update(ledgerText).digest('hex'),
        EXPECTED_SHA256,
      );

      let variants = 0;
      for (const path of paths) {
        const entry = byPath.get(path);
        if (entry === undefined) {
          throw new Error(`P1C baseline missing classification for ${path}`);
        }
        assertSame(entry.partition, 'core', path);
        assertSame(
          entry.status,
          'blocked:early-errors-and-declaration-instantiation',
          path,
        );
        assertSame(
          entry.blocker,
          'early-errors-and-declaration-instantiation',
          path,
        );
        variants += entry.variants;
      }
      assertSame(variants, 161);
    },
  },
  {
    name: 'P1C baseline validation rejects a non-array baseline',
    run: () => {
      const error = assertThrows(() => validateP1CBaseline(null), Error);
      assertSame(error.message, 'P1C baseline must be an array');
    },
  },
  {
    name: 'P1C baseline validation rejects duplicate paths',
    run: () => {
      const error = assertThrows(
        () =>
          validateP1CBaseline([
            {
              path: 'test/a.js',
              variants: 1,
              partition: 'core',
              status: 'blocked:early-errors-and-declaration-instantiation',
              blocker: 'early-errors-and-declaration-instantiation',
              features: [],
              flags: [],
              includes: [],
              provenance: [],
            },
            {
              path: 'test/a.js',
              variants: 2,
              partition: 'core',
              status: 'blocked:early-errors-and-declaration-instantiation',
              blocker: 'early-errors-and-declaration-instantiation',
              features: [],
              flags: [],
              includes: [],
              provenance: [],
            },
          ]),
        Error,
      );
      assertSame(error.message, 'P1C baseline repeats path test/a.js');
    },
  },
  {
    name: 'P1C baseline validation rejects non-integer variants',
    run: () => {
      const error = assertThrows(
        () =>
          validateP1CBaseline([
            {
              path: 'test/a.js',
              variants: 1.5,
              partition: 'core',
              status: 'blocked:early-errors-and-declaration-instantiation',
              blocker: 'early-errors-and-declaration-instantiation',
              features: [],
              flags: [],
              includes: [],
              provenance: [],
            },
          ]),
        Error,
      );
      assertSame(
        error.message,
        'P1C baseline[0].variants must be a positive integer',
      );
    },
  },
];

/**
 * @param {unknown} baseline
 * @returns {P1cBaseline}
 */
function validateP1CBaseline(baseline) {
  if (!Array.isArray(baseline)) {
    throw new Error('P1C baseline must be an array');
  }

  const entries = /** @type {readonly unknown[]} */ (baseline);
  /** @type {P1cBaselineClassification[]} */
  const validated = [];
  const paths = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`P1C baseline[${index}] must be an object`);
    }

    const record = /** @type {Record<string, unknown>} */ (entry);
    if (typeof record.path !== 'string' || record.path.length === 0) {
      throw new Error(`P1C baseline[${index}].path must be a nonempty string`);
    }
    const path = /** @type {string} */ (record.path);
    const variants = /** @type {number} */ (record.variants);
    if (paths.has(path)) {
      throw new Error(`P1C baseline repeats path ${path}`);
    }
    if (!Number.isInteger(variants) || variants <= 0) {
      throw new Error(
        `P1C baseline[${index}].variants must be a positive integer`,
      );
    }
    if (record.partition !== 'core') {
      throw new Error(`P1C baseline[${index}].partition must be "core"`);
    }
    if (
      record.status !== 'blocked:early-errors-and-declaration-instantiation'
    ) {
      throw new Error(
        `P1C baseline[${index}].status must be "blocked:early-errors-and-declaration-instantiation"`,
      );
    }
    if (record.blocker !== 'early-errors-and-declaration-instantiation') {
      throw new Error(
        `P1C baseline[${index}].blocker must be "early-errors-and-declaration-instantiation"`,
      );
    }

    validated.push({
      path,
      variants,
      partition: 'core',
      status: 'blocked:early-errors-and-declaration-instantiation',
      blocker: 'early-errors-and-declaration-instantiation',
      features: validateStringArray(
        record.features,
        `P1C baseline[${index}].features`,
      ),
      flags: validateStringArray(record.flags, `P1C baseline[${index}].flags`),
      includes: validateStringArray(
        record.includes,
        `P1C baseline[${index}].includes`,
      ),
      provenance: validateStringArray(
        record.provenance,
        `P1C baseline[${index}].provenance`,
      ),
    });
    paths.add(record.path);
  }

  return validated;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {readonly string[]}
 */
function validateStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'string') {
      throw new Error(`${label}[${index}] must be a string`);
    }
  }
  return value;
}
