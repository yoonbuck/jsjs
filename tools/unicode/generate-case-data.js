#!/usr/bin/env node
/**
 * Generates `src/builtins/unicode-case-data.js` from the Unicode Character
 * Database.
 *
 * The engine implements `String.prototype.toLowerCase`/`toUpperCase` itself
 * (ES5 15.5.4.16-19 defer to "the Unicode Default Case Conversion algorithm"),
 * so it needs the mapping data as project-owned source rather than as a host
 * `String.prototype` call or an npm dependency. This tool is the *only* way
 * that data is produced: it downloads the pinned UCD files named in
 * `package.json`'s `unicode` field, derives every table the runtime uses, and
 * writes one generated module. The runtime itself never touches the network
 * and never parses a UCD file.
 *
 * Usage:
 *   node tools/unicode/generate-case-data.js            # regenerate the module
 *   node tools/unicode/generate-case-data.js --check    # verify it is current
 *   node tools/unicode/generate-case-data.js --from=DIR # use local UCD copies
 *
 * `--check` re-derives the tables from the UCD and compares them with the
 * *decoded* contents of the checked-in module, so it is insensitive to
 * formatting (the generated file is checked in Prettier-formatted, like every
 * other source file). Both `--check` and plain generation need network access
 * unless `--from` points at a directory holding the three UCD files.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const IDENTIFIER_PART_CATEGORIES = new Set([
  'Lu',
  'Ll',
  'Lt',
  'Lm',
  'Lo',
  'Nl',
  'Mn',
  'Mc',
  'Nd',
  'Pc',
]);

/**
 * @typedef {{
 *   simpleLowercase: Map<number, number>,
 *   simpleUppercase: Map<number, number>,
 *   specialLowercase: Map<number, number[]>,
 *   specialUppercase: Map<number, number[]>,
 *   cased: number[][],
 *   caseIgnorable: number[][],
 *   spaceSeparator: number[][],
 *   identifierPart: number[][],
 *   digests: Record<string, string>,
 * }} CaseData
 *
 * @typedef {{
 *   version: string,
 *   baseUrl: string,
 *   files: Record<string, string>,
 *   generatedModule: string,
 * }} UnicodePin
 */

/**
 * @returns {Promise<UnicodePin>}
 */
async function readPin() {
  const manifest = JSON.parse(
    await readFile(new URL('package.json', REPOSITORY_ROOT), 'utf8'),
  );
  const pin = manifest.unicode;

  if (!pin || typeof pin.version !== 'string') {
    throw new Error('package.json must declare a "unicode" pin');
  }

  return pin;
}

/**
 * @param {string} name
 * @param {UnicodePin} pin
 * @param {string | undefined} localDirectory
 * @returns {Promise<string>}
 */
async function readUnicodeFile(name, pin, localDirectory) {
  const fileName = pin.files[name];

  if (fileName === undefined) {
    throw new Error(`package.json's unicode pin has no "${name}" file`);
  }

  if (localDirectory !== undefined) {
    return readFile(new URL(fileName, `file://${localDirectory}/`), 'utf8');
  }

  const url = `${pin.baseUrl}${fileName}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`failed to download ${url}: ${response.status}`);
  }

  return response.text();
}

/**
 * @param {string} text
 * @returns {string}
 */
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Expands `0041..005A`-style code point specifications.
 *
 * @param {string} field
 * @returns {number[]}
 */
function parseRange(field) {
  const dots = field.indexOf('..');

  if (dots === -1) {
    const single = Number.parseInt(field, 16);
    return [single, single];
  }

  return [
    Number.parseInt(field.slice(0, dots), 16),
    Number.parseInt(field.slice(dots + 2), 16),
  ];
}

/**
 * @param {string} field
 * @returns {number[]}
 */
function parseCodePoints(field) {
  return field
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => Number.parseInt(token, 16));
}

/**
 * @param {number[][]} ranges
 * @returns {number[][]}
 */
function coalesce(ranges) {
  /** @type {number[][]} */
  const merged = [];

  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];

    if (last !== undefined && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

/**
 * @param {string} unicodeData UnicodeData.txt
 * @param {string} specialCasing SpecialCasing.txt
 * @param {string} derivedCoreProperties DerivedCoreProperties.txt
 * @returns {CaseData}
 */
function deriveTables(unicodeData, specialCasing, derivedCoreProperties) {
  /** @type {Map<number, number>} */
  const simpleLowercase = new Map();
  /** @type {Map<number, number>} */
  const simpleUppercase = new Map();
  /** @type {number[][]} */
  const spaceSeparator = [];
  /** @type {number[][]} */
  const identifierPart = [];
  /** @type {number | undefined} */
  let rangeStart;

  /**
   * @param {number[][]} ranges
   * @param {number} start
   * @param {number} end
   * @returns {void}
   */
  function pushBmpRange(ranges, start, end) {
    if (start >= 0x10000) {
      return;
    }

    ranges.push([start, Math.min(end, 0xffff)]);
  }

  for (const line of unicodeData.split('\n')) {
    if (line.length === 0) {
      continue;
    }

    const fields = line.split(';');
    const codePoint = Number.parseInt(fields[0], 16);
    const name = fields[1];
    const category = fields[2];
    const upper = fields[12];
    const lower = fields[13];

    // UnicodeData.txt writes large blocks as a "First>"/"Last>" pair. Only
    // the general category matters for those blocks (no block-range
    // character carries a case mapping), so they are expanded here alone.
    if (name.endsWith(', First>')) {
      rangeStart = codePoint;
      continue;
    }

    if (name.endsWith(', Last>')) {
      if (category === 'Zs' && rangeStart !== undefined) {
        spaceSeparator.push([rangeStart, codePoint]);
      }

      if (
        IDENTIFIER_PART_CATEGORIES.has(category) &&
        rangeStart !== undefined
      ) {
        pushBmpRange(identifierPart, rangeStart, codePoint);
      }

      rangeStart = undefined;
      continue;
    }

    if (category === 'Zs') {
      spaceSeparator.push([codePoint, codePoint]);
    }

    if (IDENTIFIER_PART_CATEGORIES.has(category)) {
      pushBmpRange(identifierPart, codePoint, codePoint);
    }

    if (lower.length > 0) {
      simpleLowercase.set(codePoint, Number.parseInt(lower, 16));
    }

    if (upper.length > 0) {
      simpleUppercase.set(codePoint, Number.parseInt(upper, 16));
    }
  }

  /** @type {Map<number, number[]>} */
  const specialLowercase = new Map();
  /** @type {Map<number, number[]>} */
  const specialUppercase = new Map();

  for (const rawLine of specialCasing.split('\n')) {
    const line = rawLine.split('#')[0].trim();

    if (line.length === 0) {
      continue;
    }

    const fields = line.split(';').map((field) => field.trim());

    // Fields: code; lower; title; upper; (condition_list;)? A condition list
    // means the mapping is conditional. ES5 15.5.4.16/18 ask for the
    // *locale-insensitive* mappings only, so language-tagged conditions
    // (lt/tr/az) are skipped here, and the one language-neutral condition
    // (Final_Sigma) is implemented by the runtime rather than tabulated.
    if (fields.length > 4 && fields[4].length > 0) {
      continue;
    }

    const codePoint = Number.parseInt(fields[0], 16);
    const lower = parseCodePoints(fields[1]);
    const upper = parseCodePoints(fields[3]);
    const simpleLower = simpleLowercase.get(codePoint) ?? codePoint;
    const simpleUpper = simpleUppercase.get(codePoint) ?? codePoint;

    if (lower.length !== 1 || lower[0] !== simpleLower) {
      specialLowercase.set(codePoint, lower);
    }

    if (upper.length !== 1 || upper[0] !== simpleUpper) {
      specialUppercase.set(codePoint, upper);
    }
  }

  /** @type {number[][]} */
  const cased = [];
  /** @type {number[][]} */
  const caseIgnorable = [];

  for (const rawLine of derivedCoreProperties.split('\n')) {
    const line = rawLine.split('#')[0].trim();

    if (line.length === 0) {
      continue;
    }

    const fields = line.split(';').map((field) => field.trim());
    const property = fields[1];

    if (property === 'Cased') {
      cased.push(parseRange(fields[0]));
    } else if (property === 'Case_Ignorable') {
      caseIgnorable.push(parseRange(fields[0]));
    }
  }

  return {
    simpleLowercase,
    simpleUppercase,
    specialLowercase,
    specialUppercase,
    cased: coalesce(cased),
    caseIgnorable: coalesce(caseIgnorable),
    spaceSeparator: coalesce(spaceSeparator),
    identifierPart: coalesce([
      ...identifierPart,
      [0x200c, 0x200c],
      [0x200d, 0x200d],
    ]),
    digests: {
      unicodeData: sha256(unicodeData),
      specialCasing: sha256(specialCasing),
      derivedCoreProperties: sha256(derivedCoreProperties),
    },
  };
}

/**
 * Compresses a code-point-to-code-point map into `start stride count delta`
 * runs. Case mappings are overwhelmingly regular (the ASCII letters and the
 * Cyrillic block are single `+32` runs; Latin Extended-A is alternating `+1`
 * runs), so this turns ~1400 entries into a few hundred records.
 *
 * @param {Map<number, number>} map
 * @returns {number[][]}
 */
function toRuns(map) {
  const entries = [...map.entries()].sort((a, b) => a[0] - b[0]);
  /** @type {number[][]} */
  const runs = [];
  let index = 0;

  while (index < entries.length) {
    let bestStride = 1;
    let bestCount = 1;

    for (const stride of [1, 2]) {
      const delta = entries[index][1] - entries[index][0];
      let count = 1;

      while (
        index + count < entries.length &&
        entries[index + count][0] === entries[index][0] + count * stride &&
        entries[index + count][1] - entries[index + count][0] === delta
      ) {
        count += 1;
      }

      if (count > bestCount) {
        bestStride = stride;
        bestCount = count;
      }
    }

    runs.push([
      entries[index][0],
      bestStride,
      bestCount,
      entries[index][1] - entries[index][0],
    ]);
    index += bestCount;
  }

  return runs;
}

/**
 * @param {Map<number, number[]>} map
 * @returns {number[][]}
 */
function toSpecialRecords(map) {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([codePoint, units]) => [codePoint, units.length, ...units]);
}

/**
 * Encodes records as space-separated hexadecimal numbers with `;` between
 * records. The runtime decodes this with its own scanner (no host
 * `String.prototype` method), and keeping the tables as text rather than as
 * nested arrays keeps the generated module small and stable under Prettier.
 *
 * @param {number[][]} records
 * @returns {string}
 */
function encodeRecords(records) {
  return records
    .map((record) =>
      record
        .map((value) =>
          value < 0 ? `-${(-value).toString(16)}` : value.toString(16),
        )
        .join(' '),
    )
    .join(';');
}

/**
 * @param {string} text
 * @param {number} width
 * @param {string} declaration The surrounding `const NAME = ` … `.join('');`
 *   text, so the one-line form is only used when Prettier would use it too.
 * @returns {string}
 */
function chunk(text, width, declaration) {
  /** @type {string[]} */
  const parts = [];

  for (let index = 0; index < text.length; index += width) {
    parts.push(text.slice(index, index + width));
  }

  // Matches how Prettier prints the resulting array literal: it stays on one
  // line only while the whole declaration fits in the 80-column print width.
  const singleLine = `['${parts.join("', '")}']`;

  return declaration.length + singleLine.length <= 80
    ? singleLine
    : `[\n${parts.map((part) => `  '${part}',`).join('\n')}\n]`;
}

/**
 * @param {CaseData} data
 * @param {UnicodePin} pin
 * @returns {string}
 */
function renderModule(data, pin) {
  const tables = [
    [
      'SIMPLE_LOWERCASE_RUNS',
      'Simple lowercase mappings (UnicodeData.txt field 13), as `start stride\n * count delta` runs.',
      encodeRecords(toRuns(data.simpleLowercase)),
    ],
    [
      'SIMPLE_UPPERCASE_RUNS',
      'Simple uppercase mappings (UnicodeData.txt field 12), as `start stride\n * count delta` runs.',
      encodeRecords(toRuns(data.simpleUppercase)),
    ],
    [
      'SPECIAL_LOWERCASE_RECORDS',
      'Unconditional multi-character lowercase mappings (SpecialCasing.txt\n * field 1), as `codePoint length unit...` records.',
      encodeRecords(toSpecialRecords(data.specialLowercase)),
    ],
    [
      'SPECIAL_UPPERCASE_RECORDS',
      'Unconditional multi-character uppercase mappings (SpecialCasing.txt\n * field 3), as `codePoint length unit...` records.',
      encodeRecords(toSpecialRecords(data.specialUppercase)),
    ],
    [
      'CASED_RANGES',
      'The Cased derived property (DerivedCoreProperties.txt), as `start end`\n * ranges. Used only by the Final_Sigma condition.',
      encodeRecords(data.cased),
    ],
    [
      'CASE_IGNORABLE_RANGES',
      'The Case_Ignorable derived property (DerivedCoreProperties.txt), as\n * `start end` ranges. Used only by the Final_Sigma condition.',
      encodeRecords(data.caseIgnorable),
    ],
    [
      'SPACE_SEPARATOR_RANGES',
      'General category Zs (UnicodeData.txt field 2), as `start end` ranges.\n * This is the "other category Zs" clause of ES5 7.2\'s WhiteSpace\n * production, used by String.prototype.trim.',
      encodeRecords(data.spaceSeparator),
    ],
    [
      'IDENTIFIER_PART_RANGES',
      'BMP code points in ES5 7.6 IdentifierPart Unicode categories\n * (UnicodeData.txt field 2), plus ZWNJ and ZWJ, as `start end` ranges.',
      encodeRecords(data.identifierPart),
    ],
  ];

  const header = `/**
 * Unicode case-conversion and whitespace data. GENERATED FILE — DO NOT EDIT.
 *
 * Produced by \`tools/unicode/generate-case-data.js\`
 * (\`npm run unicode:generate\`) from the Unicode Character Database version
 * ${pin.version}:
 *
 *   ${pin.baseUrl}${pin.files.unicodeData}
 *     sha256 ${data.digests.unicodeData}
 *   ${pin.baseUrl}${pin.files.specialCasing}
 *     sha256 ${data.digests.specialCasing}
 *   ${pin.baseUrl}${pin.files.derivedCoreProperties}
 *     sha256 ${data.digests.derivedCoreProperties}
 *
 * The version, base URL, and file names are pinned in \`package.json\`'s
 * \`unicode\` field; \`npm run unicode:check\` re-derives every table from those
 * files and fails if this module has drifted. Updating to a new Unicode
 * version is therefore a two-step change: edit the pin, rerun the generator.
 *
 * Every table is stored as text — space-separated hexadecimal numbers, \`;\`
 * between records — and decoded by this module's own scanner. That keeps the
 * data compact and keeps the String family free of any host
 * \`String.prototype\` parsing helper, which it is not allowed to use.
 */
`;

  const body = tables
    .map(
      ([name, description, encoded]) =>
        `/**\n * ${description}\n */\nconst ${name} = ${chunk(encoded, 70, `const ${name} = .join('');`)}.join('');\n`,
    )
    .join('\n');

  const footer = `/** @type {Record<string, number>} */
const HEX_DIGITS = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  a: 10,
  b: 11,
  c: 12,
  d: 13,
  e: 14,
  f: 15,
};

/**
 * Decodes one encoded table into a flat array of numbers, reading it one code
 * unit at a time: hexadecimal digits accumulate into the current value, \`-\`
 * marks a negative value, and \` \` or \`;\` ends one. Record boundaries are
 * implied by each table's fixed shape, so only the numbers are needed here.
 *
 * @param {string} text
 * @returns {number[]}
 */
function decode(text) {
  /** @type {number[]} */
  const values = [];
  let value = 0;
  let digits = 0;
  let negative = false;

  for (let index = 0; index <= text.length; index += 1) {
    const unit = index < text.length ? text[index] : ' ';

    if (unit === '-') {
      negative = true;
      continue;
    }

    if (unit === ' ' || unit === ';') {
      if (digits > 0) {
        values.push(negative ? -value : value);
      }

      value = 0;
      digits = 0;
      negative = false;
      continue;
    }

    value = value * 16 + HEX_DIGITS[unit];
    digits += 1;
  }

  return values;
}

/** The Unicode version every table in this module was derived from. */
export const UNICODE_VERSION = '${pin.version}';

/** Flat \`start, stride, count, delta\` quadruples. */
export const simpleLowercaseRuns = decode(SIMPLE_LOWERCASE_RUNS);

/** Flat \`start, stride, count, delta\` quadruples. */
export const simpleUppercaseRuns = decode(SIMPLE_UPPERCASE_RUNS);

/** Flat \`codePoint, length, unit...\` records. */
export const specialLowercaseRecords = decode(SPECIAL_LOWERCASE_RECORDS);

/** Flat \`codePoint, length, unit...\` records. */
export const specialUppercaseRecords = decode(SPECIAL_UPPERCASE_RECORDS);

/** Flat \`start, end\` pairs. */
export const casedRanges = decode(CASED_RANGES);

/** Flat \`start, end\` pairs. */
export const caseIgnorableRanges = decode(CASE_IGNORABLE_RANGES);

/** Flat \`start, end\` pairs. */
export const spaceSeparatorRanges = decode(SPACE_SEPARATOR_RANGES);

/** Flat \`start, end\` pairs. */
export const identifierPartRanges = decode(IDENTIFIER_PART_RANGES);
`;

  return `${header}\n${body}\n${footer}`;
}

/**
 * @param {CaseData} data
 * @returns {Record<string, string>}
 */
function fingerprint(data) {
  return {
    simpleLowercase: encodeRecords(toRuns(data.simpleLowercase)),
    simpleUppercase: encodeRecords(toRuns(data.simpleUppercase)),
    specialLowercase: encodeRecords(toSpecialRecords(data.specialLowercase)),
    specialUppercase: encodeRecords(toSpecialRecords(data.specialUppercase)),
    cased: encodeRecords(data.cased),
    caseIgnorable: encodeRecords(data.caseIgnorable),
    spaceSeparator: encodeRecords(data.spaceSeparator),
    identifierPart: encodeRecords(data.identifierPart),
  };
}

/**
 * @param {number[]} values
 * @param {number} size
 * @returns {number[][]}
 */
function group(values, size) {
  /** @type {number[][]} */
  const records = [];

  for (let index = 0; index < values.length; index += size) {
    records.push(values.slice(index, index + size));
  }

  return records;
}

/**
 * @param {number[]} values Flat `codePoint, length, unit...` records.
 * @returns {number[][]}
 */
function groupSpecial(values) {
  /** @type {number[][]} */
  const records = [];
  let index = 0;

  while (index < values.length) {
    const length = values[index + 1];
    records.push(values.slice(index, index + 2 + length));
    index += 2 + length;
  }

  return records;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const fromArgument = args.find((argument) => argument.startsWith('--from='));
  const localDirectory = fromArgument?.slice('--from='.length);
  const pin = await readPin();

  const [unicodeData, specialCasing, derivedCoreProperties] = await Promise.all(
    [
      readUnicodeFile('unicodeData', pin, localDirectory),
      readUnicodeFile('specialCasing', pin, localDirectory),
      readUnicodeFile('derivedCoreProperties', pin, localDirectory),
    ],
  );
  const data = deriveTables(unicodeData, specialCasing, derivedCoreProperties);

  if (!check) {
    await writeFile(
      new URL(pin.generatedModule, REPOSITORY_ROOT),
      renderModule(data, pin),
      'utf8',
    );
    process.stdout.write(
      `wrote ${pin.generatedModule} from Unicode ${pin.version}\n`,
    );
    return;
  }

  const module = await import(
    new URL(pin.generatedModule, REPOSITORY_ROOT).href
  );
  const expected = fingerprint(data);
  /** @type {Record<string, string>} */
  const actual = {
    simpleLowercase: encodeRecords(group(module.simpleLowercaseRuns, 4)),
    simpleUppercase: encodeRecords(group(module.simpleUppercaseRuns, 4)),
    specialLowercase: encodeRecords(
      groupSpecial(module.specialLowercaseRecords),
    ),
    specialUppercase: encodeRecords(
      groupSpecial(module.specialUppercaseRecords),
    ),
    cased: encodeRecords(group(module.casedRanges, 2)),
    caseIgnorable: encodeRecords(group(module.caseIgnorableRanges, 2)),
    spaceSeparator: encodeRecords(group(module.spaceSeparatorRanges, 2)),
    identifierPart: encodeRecords(group(module.identifierPartRanges, 2)),
  };
  /** @type {string[]} */
  const problems = [];

  if (module.UNICODE_VERSION !== pin.version) {
    problems.push(
      `UNICODE_VERSION is ${module.UNICODE_VERSION}, pin says ${pin.version}`,
    );
  }

  for (const [name, value] of Object.entries(expected)) {
    if (actual[name] !== value) {
      problems.push(`${name} differs from the pinned Unicode ${pin.version}`);
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${pin.generatedModule} matches Unicode ${pin.version}\n`,
  );
}

// Not top-level `await`: the repository's lint configuration targets
// ES2020, where a module may not await at the top level.
main().catch((error) => {
  process.exitCode = 1;
  process.stderr.write(`${error && error.message ? error.message : error}\n`);
});
