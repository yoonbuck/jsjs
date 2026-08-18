/**
 * Test262 frontmatter parsing.
 *
 * Test262 files carry their metadata in a `/*---` ... `---*\/` comment block
 * written in a small, well-behaved subset of YAML. This module reads that
 * subset directly — it never evaluates the block — so the same code is safe
 * and portable across Node, JavaScriptCore, and browsers.
 *
 * The supported subset is exactly what the upstream `INTERPRETING.md`
 * documents: scalar keys, literal (`|`) and folded (`>`) block scalars, flow
 * sequences (`[a, b]`), block sequences (`- a`), and the two-key `negative`
 * mapping. Anything outside that subset is rejected with a
 * `Test262MetadataError` rather than being silently misread, because a
 * misread expectation turns a failing test into a false pass.
 */

/**
 * @typedef {{ phase: 'parse' | 'resolution' | 'runtime', type: string }} NegativeExpectation
 *
 * @typedef {{
 *   description: string,
 *   esid: string | null,
 *   es5id: string | null,
 *   es6id: string | null,
 *   info: string | null,
 *   author: string | null,
 *   negative: NegativeExpectation | null,
 *   includes: readonly string[],
 *   flags: readonly string[],
 *   features: readonly string[],
 *   locale: readonly string[],
 *   defines: readonly string[],
 * }} Test262Metadata
 *
 * @typedef {'non-strict' | 'strict' | 'raw'} Test262Variant
 */

/** Harness files every non-raw test is run with (upstream INTERPRETING.md). */
export const DEFAULT_INCLUDES = Object.freeze(['assert.js', 'sta.js']);

/** Frontmatter keys whose value is a single scalar. */
const SCALAR_KEYS = Object.freeze([
  'description',
  'esid',
  'es5id',
  'es6id',
  'info',
  'author',
]);

/** Frontmatter keys whose value is a sequence of scalars. */
const SEQUENCE_KEYS = Object.freeze([
  'includes',
  'flags',
  'features',
  'locale',
  'defines',
]);

/** Frontmatter keys whose value is a nested mapping. */
const MAPPING_KEYS = Object.freeze(['negative']);

const KNOWN_KEYS = Object.freeze([
  ...SCALAR_KEYS,
  ...SEQUENCE_KEYS,
  ...MAPPING_KEYS,
]);

const KNOWN_FLAGS = Object.freeze([
  'onlyStrict',
  'noStrict',
  'module',
  'raw',
  'async',
  'generated',
  'CanBlockIsFalse',
  'CanBlockIsTrue',
  'non-deterministic',
]);

const NEGATIVE_PHASES = Object.freeze(['parse', 'resolution', 'runtime']);

const FRONTMATTER_START = '/*---';
const FRONTMATTER_END = '---*/';

/**
 * A frontmatter block that is missing, unterminated, or outside the supported
 * YAML subset. Callers turn this into a reported `metadata-error` record.
 */
export class Test262MetadataError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'Test262MetadataError';
  }
}

/**
 * @param {string} source
 * @returns {Test262Metadata}
 */
export function parseTest262Metadata(source) {
  if (typeof source !== 'string') {
    throw new Test262MetadataError('Test source must be a string');
  }

  const start = source.indexOf(FRONTMATTER_START);

  if (start === -1) {
    throw new Test262MetadataError('Missing Test262 frontmatter block');
  }

  const bodyStart = start + FRONTMATTER_START.length;
  const end = source.indexOf(FRONTMATTER_END, bodyStart);

  if (end === -1) {
    throw new Test262MetadataError('Unterminated Test262 frontmatter block');
  }

  const lines = normalizeBlockIndent(
    source.slice(bodyStart, end).split(/\r\n?|\n/),
  );

  return buildMetadata(parseBlock(lines));
}

/**
 * YAML permits the complete document to be indented. Test262 normally starts
 * root keys in column zero, but a small set of legacy files indents every root
 * key by one space. Remove only that common document margin; relative
 * indentation inside block scalars, sequences, and mappings stays unchanged.
 *
 * @param {readonly string[]} lines
 * @returns {string[]}
 */
function normalizeBlockIndent(lines) {
  const content = lines.filter(
    (line) => line.trim() !== '' && !isComment(line),
  );
  if (content.length === 0) {
    return [...lines];
  }

  const indent = Math.min(...content.map((line) => leadingSpaces(line)));
  if (indent === 0) {
    return [...lines];
  }

  return lines.map((line) =>
    leadingSpaces(line) >= indent ? line.slice(indent) : line,
  );
}

/**
 * Which run variants a test expands into (upstream INTERPRETING.md): `raw`
 * tests run verbatim exactly once, `onlyStrict`/`noStrict`/`module` pin a
 * single variant, and everything else runs twice.
 *
 * @param {Test262Metadata} metadata
 * @returns {Test262Variant[]}
 */
export function expandVariants(metadata) {
  if (metadata.flags.includes('raw')) {
    return ['raw'];
  }

  if (metadata.flags.includes('onlyStrict')) {
    return ['strict'];
  }

  if (
    metadata.flags.includes('noStrict') ||
    metadata.flags.includes('module')
  ) {
    return ['non-strict'];
  }

  return ['non-strict', 'strict'];
}

/**
 * The harness files a test needs, in evaluation order: the always-on defaults
 * first, then the declared `includes`, with duplicates collapsed. `raw` tests
 * declare no includes and receive none.
 *
 * @param {Test262Metadata} metadata
 * @returns {string[]}
 */
export function resolveIncludes(metadata) {
  if (metadata.flags.includes('raw')) {
    return [];
  }

  /** @type {string[]} */
  const includes = [];

  for (const name of [...DEFAULT_INCLUDES, ...metadata.includes]) {
    if (!includes.includes(name)) {
      includes.push(name);
    }
  }

  return includes;
}

/**
 * @param {readonly string[]} lines
 * @returns {Map<string, string | string[] | Map<string, string>>}
 */
function parseBlock(lines) {
  /** @type {Map<string, string | string[] | Map<string, string>>} */
  const entries = new Map();
  let index = 0;

  while (index < lines.length) {
    const line = stripCarriageReturn(lines[index]);
    index += 1;

    if (line.trim() === '' || isComment(line)) {
      continue;
    }

    rejectTabs(line);

    if (leadingSpaces(line) !== 0) {
      throw new Test262MetadataError(
        `Unexpected indented frontmatter line: ${line.trim()}`,
      );
    }

    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);

    if (match === null) {
      throw new Test262MetadataError(
        `Unparsable frontmatter line: ${line.trim()}`,
      );
    }

    const key = match[1];
    const inline = match[2].trim();

    if (!KNOWN_KEYS.includes(key)) {
      throw new Test262MetadataError(`Unsupported frontmatter key: ${key}`);
    }

    if (entries.has(key)) {
      throw new Test262MetadataError(`Duplicate frontmatter key: ${key}`);
    }

    const block = [];

    while (index < lines.length) {
      const candidate = stripCarriageReturn(lines[index]);

      if (candidate.trim() !== '' && leadingSpaces(candidate) === 0) {
        break;
      }

      block.push(candidate);
      index += 1;
    }

    entries.set(key, readValue(key, inline, block));
  }

  return entries;
}

/**
 * @param {string} key
 * @param {string} inline
 * @param {readonly string[]} block
 * @returns {string | string[] | Map<string, string>}
 */
function readValue(key, inline, block) {
  if (inline === '|' || inline === '|-' || inline === '>' || inline === '>-') {
    return readBlockScalar(key, inline, block);
  }

  if (inline.startsWith('[')) {
    requireEmptyBlock(key, block);
    return readFlowSequence(key, inline);
  }

  if (inline !== '') {
    requireEmptyBlock(key, block);
    return unquote(inline);
  }

  const content = block.filter(
    (line) => line.trim() !== '' && !isComment(line),
  );

  if (content.length === 0) {
    return '';
  }

  for (const line of content) {
    rejectTabs(line);
  }

  if (content.every((line) => line.trim().startsWith('- '))) {
    return content.map((line) => unquote(line.trim().slice(2).trim()));
  }

  return readMapping(key, content);
}

/**
 * @param {string} key
 * @param {string} indicator
 * @param {readonly string[]} block
 * @returns {string}
 */
function readBlockScalar(key, indicator, block) {
  const content = [...block];

  while (content.length > 0 && content[content.length - 1].trim() === '') {
    content.pop();
  }

  if (content.length === 0) {
    return '';
  }

  for (const line of content) {
    rejectTabs(line);
  }

  const indent = Math.min(
    ...content
      .filter((line) => line.trim() !== '')
      .map((line) => leadingSpaces(line)),
  );
  const dedented = content.map((line) => line.slice(indent));

  if (indicator.startsWith('|')) {
    return dedented.join('\n');
  }

  return foldBlockScalarLines(dedented);
}

/**
 * Folds the dedented lines of a YAML folded block scalar (`>`), following the
 * YAML 1.2 line-folding rules: consecutive non-empty lines join with a single
 * space, a run of k blank lines folds to k newline characters, and
 * "more-indented" lines (those that keep leading whitespace after the block
 * indent is removed) are emitted literally with the surrounding line breaks
 * preserved rather than folded. Trailing blank lines have already been stripped
 * by the caller, so no trailing newline is produced.
 *
 * @param {readonly string[]} lines
 * @returns {string}
 */
function foldBlockScalarLines(lines) {
  let result = '';
  let started = false;
  let previousMoreIndented = false;
  let pendingBlanks = 0;

  for (const rawLine of lines) {
    if (rawLine.trim() === '') {
      pendingBlanks += 1;
      continue;
    }

    const line = rawLine.replace(/\s+$/, '');
    const moreIndented = /^\s/.test(line);

    if (!started) {
      result += line;
    } else if (moreIndented || previousMoreIndented) {
      result += '\n'.repeat(pendingBlanks + 1) + line;
    } else if (pendingBlanks > 0) {
      result += '\n'.repeat(pendingBlanks) + line;
    } else {
      result += ` ${line}`;
    }

    started = true;
    previousMoreIndented = moreIndented;
    pendingBlanks = 0;
  }

  return result;
}

/**
 * @param {string} key
 * @param {string} inline
 * @returns {string[]}
 */
function readFlowSequence(key, inline) {
  if (!inline.endsWith(']')) {
    throw new Test262MetadataError(
      `Unterminated flow sequence for key: ${key}`,
    );
  }

  const body = inline.slice(1, -1).trim();

  if (body === '') {
    return [];
  }

  return body.split(',').map((item) => {
    const value = unquote(item.trim());

    if (value === '') {
      throw new Test262MetadataError(`Empty item in ${key} sequence`);
    }

    return value;
  });
}

/**
 * @param {string} key
 * @param {readonly string[]} content
 * @returns {Map<string, string>}
 */
function readMapping(key, content) {
  /** @type {Map<string, string>} */
  const mapping = new Map();

  for (const line of content) {
    const match = /^\s+([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);

    if (match === null) {
      throw new Test262MetadataError(
        `Unparsable frontmatter line: ${line.trim()}`,
      );
    }

    if (mapping.has(match[1])) {
      throw new Test262MetadataError(`Duplicate ${key} entry: ${match[1]}`);
    }

    mapping.set(match[1], unquote(match[2].trim()));
  }

  return mapping;
}

/**
 * @param {Map<string, string | string[] | Map<string, string>>} entries
 * @returns {Test262Metadata}
 */
function buildMetadata(entries) {
  for (const key of SCALAR_KEYS) {
    const value = entries.get(key);

    if (value !== undefined && typeof value !== 'string') {
      throw new Test262MetadataError(`Expected a scalar value for key: ${key}`);
    }
  }

  for (const key of SEQUENCE_KEYS) {
    const value = entries.get(key);

    if (value !== undefined && !Array.isArray(value)) {
      throw new Test262MetadataError(`Expected a sequence for key: ${key}`);
    }
  }

  const description = /** @type {string | undefined} */ (
    entries.get('description')
  );

  if (description === undefined || description.trim() === '') {
    throw new Test262MetadataError('Missing frontmatter description');
  }

  const flags = readStringList(entries, 'flags');

  for (const flag of flags) {
    if (!KNOWN_FLAGS.includes(flag)) {
      throw new Test262MetadataError(`Unsupported frontmatter flag: ${flag}`);
    }
  }

  const includes = readStringList(entries, 'includes');

  validateFlagCombinations(flags, includes);

  return Object.freeze({
    description: description.trim(),
    esid: readOptionalScalar(entries, 'esid'),
    es5id: readOptionalScalar(entries, 'es5id'),
    es6id: readOptionalScalar(entries, 'es6id'),
    info: readOptionalScalar(entries, 'info'),
    author: readOptionalScalar(entries, 'author'),
    negative: readNegative(entries),
    includes: Object.freeze(includes),
    flags: Object.freeze(flags),
    features: Object.freeze(readStringList(entries, 'features')),
    locale: Object.freeze(readStringList(entries, 'locale')),
    defines: Object.freeze(readStringList(entries, 'defines')),
  });
}

/**
 * @param {readonly string[]} flags
 * @param {readonly string[]} includes
 * @returns {void}
 */
function validateFlagCombinations(flags, includes) {
  if (flags.includes('onlyStrict') && flags.includes('noStrict')) {
    throw new Test262MetadataError(
      'Conflicting frontmatter flags: onlyStrict and noStrict',
    );
  }

  if (!flags.includes('raw')) {
    return;
  }

  for (const flag of ['onlyStrict', 'noStrict', 'async']) {
    if (flags.includes(flag)) {
      throw new Test262MetadataError(
        `Conflicting frontmatter flags: raw and ${flag}`,
      );
    }
  }

  if (includes.length > 0) {
    throw new Test262MetadataError('A raw test cannot declare includes');
  }
}

/**
 * @param {Map<string, string | string[] | Map<string, string>>} entries
 * @returns {NegativeExpectation | null}
 */
function readNegative(entries) {
  const value = entries.get('negative');

  if (value === undefined) {
    return null;
  }

  if (!(value instanceof Map)) {
    throw new Test262MetadataError('Expected a mapping for key: negative');
  }

  for (const key of value.keys()) {
    if (key !== 'phase' && key !== 'type') {
      throw new Test262MetadataError(`Unsupported negative key: ${key}`);
    }
  }

  const phase = value.get('phase');
  const type = value.get('type');

  if (!phase || !type) {
    throw new Test262MetadataError('negative requires both a phase and a type');
  }

  if (!NEGATIVE_PHASES.includes(phase)) {
    throw new Test262MetadataError(`Unsupported negative phase: ${phase}`);
  }

  return Object.freeze({
    phase: /** @type {'parse' | 'resolution' | 'runtime'} */ (phase),
    type,
  });
}

/**
 * @param {Map<string, string | string[] | Map<string, string>>} entries
 * @param {string} key
 * @returns {string | null}
 */
function readOptionalScalar(entries, key) {
  const value = entries.get(key);

  if (value === undefined || value === '') {
    return null;
  }

  return /** @type {string} */ (value);
}

/**
 * @param {Map<string, string | string[] | Map<string, string>>} entries
 * @param {string} key
 * @returns {string[]}
 */
function readStringList(entries, key) {
  const value = entries.get(key);

  if (value === undefined || value === '') {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Test262MetadataError(`Expected a sequence for key: ${key}`);
  }

  return [...value];
}

/**
 * @param {string} key
 * @param {readonly string[]} block
 * @returns {void}
 */
function requireEmptyBlock(key, block) {
  if (block.some((line) => line.trim() !== '' && !isComment(line))) {
    throw new Test262MetadataError(
      `Unexpected indented content after key: ${key}`,
    );
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];

    if ((first === '"' || first === "'") && value[value.length - 1] === first) {
      return value.slice(1, -1);
    }
  }

  return value;
}

/**
 * @param {string} line
 * @returns {void}
 */
function rejectTabs(line) {
  if (/^[ ]*\t/.test(line)) {
    throw new Test262MetadataError(
      'Tab indentation is not supported in Test262 frontmatter',
    );
  }
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isComment(line) {
  return line.trim().startsWith('#');
}

/**
 * @param {string} line
 * @returns {number}
 */
function leadingSpaces(line) {
  const match = /^[ ]*/.exec(line);
  return match === null ? 0 : match[0].length;
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripCarriageReturn(line) {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
