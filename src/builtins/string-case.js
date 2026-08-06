import {
  charCodeOfCodeUnit,
  codeUnitFromCharCode,
} from '../runtime/code-units.js';
import {
  caseIgnorableRanges,
  casedRanges,
  simpleLowercaseRuns,
  simpleUppercaseRuns,
  specialLowercaseRecords,
  specialUppercaseRecords,
} from './unicode-case-data.js';

/**
 * The engine's Unicode case conversion, used by `String.prototype`'s
 * `toLowerCase`, `toUpperCase`, `toLocaleLowerCase`, and `toLocaleUpperCase`
 * (ES5 15.5.4.16-19).
 *
 * ES5 defers those methods to "the Unicode Default Case Conversion
 * algorithm", including the locale-insensitive entries of SpecialCasing.txt,
 * so the mappings are *data*, not arithmetic: they live in the generated
 * `unicode-case-data.js` (see `tools/unicode/generate-case-data.js` for the
 * pinned version, source URLs, and digests) and are applied here. No host
 * `String.prototype.toLowerCase`/`toUpperCase` is involved anywhere; the only
 * host string primitive in the whole family remains the single
 * number-to-code-unit conversion isolated in `runtime/code-units.js`.
 *
 * Conversion is defined over *code points*, not code units: a well-formed
 * surrogate pair is decoded, mapped, and re-encoded, so supplementary-plane
 * letters (Deseret, Adlam, ...) case-convert correctly, while an unpaired
 * surrogate passes through untouched.
 */

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;
const SUPPLEMENTARY_START = 0x10000;

/** GREEK CAPITAL LETTER SIGMA, the one conditional locale-neutral mapping. */
const CAPITAL_SIGMA = 0x03a3;

/** GREEK SMALL LETTER FINAL SIGMA. */
const FINAL_SIGMA = 0x03c2;

const simpleLowercase = expandRuns(simpleLowercaseRuns);
const simpleUppercase = expandRuns(simpleUppercaseRuns);
const specialLowercase = expandSpecialRecords(specialLowercaseRecords);
const specialUppercase = expandSpecialRecords(specialUppercaseRecords);

/**
 * @param {readonly number[]} runs Flat `start, stride, count, delta` records.
 * @returns {Map<number, number>}
 */
function expandRuns(runs) {
  /** @type {Map<number, number>} */
  const map = new Map();

  for (let index = 0; index < runs.length; index += 4) {
    const start = runs[index];
    const stride = runs[index + 1];
    const count = runs[index + 2];
    const delta = runs[index + 3];

    for (let step = 0; step < count; step += 1) {
      const codePoint = start + step * stride;
      map.set(codePoint, codePoint + delta);
    }
  }

  return map;
}

/**
 * @param {readonly number[]} records Flat `codePoint, length, unit...`.
 * @returns {Map<number, number[]>}
 */
function expandSpecialRecords(records) {
  /** @type {Map<number, number[]>} */
  const map = new Map();
  let index = 0;

  while (index < records.length) {
    const codePoint = records[index];
    const length = records[index + 1];
    /** @type {number[]} */
    const mapped = [];

    for (let offset = 0; offset < length; offset += 1) {
      mapped.push(records[index + 2 + offset]);
    }

    map.set(codePoint, mapped);
    index += 2 + length;
  }

  return map;
}

/**
 * @param {readonly number[]} ranges Flat, sorted, non-overlapping `start, end`.
 * @param {number} codePoint
 * @returns {boolean}
 */
function inRanges(ranges, codePoint) {
  let low = 0;
  let high = ranges.length / 2 - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = ranges[middle * 2];
    const end = ranges[middle * 2 + 1];

    if (codePoint < start) {
      high = middle - 1;
    } else if (codePoint > end) {
      low = middle + 1;
    } else {
      return true;
    }
  }

  return false;
}

/**
 * Decodes a string into code points. A high surrogate followed by a low
 * surrogate becomes one supplementary code point; every other code unit —
 * including an unpaired surrogate — becomes itself.
 *
 * @param {string} value
 * @returns {number[]}
 */
function toCodePoints(value) {
  /** @type {number[]} */
  const codePoints = [];

  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeOfCodeUnit(value[index]);

    if (
      code >= HIGH_SURROGATE_START &&
      code <= HIGH_SURROGATE_END &&
      index + 1 < value.length
    ) {
      const next = charCodeOfCodeUnit(value[index + 1]);

      if (next >= LOW_SURROGATE_START && next <= LOW_SURROGATE_END) {
        codePoints.push(
          SUPPLEMENTARY_START +
            (code - HIGH_SURROGATE_START) * 0x400 +
            (next - LOW_SURROGATE_START),
        );
        index += 1;
        continue;
      }
    }

    codePoints.push(code);
  }

  return codePoints;
}

/**
 * @param {number} codePoint
 * @returns {string}
 */
function fromCodePoint(codePoint) {
  if (codePoint < SUPPLEMENTARY_START) {
    return codeUnitFromCharCode(codePoint);
  }

  const offset = codePoint - SUPPLEMENTARY_START;

  return (
    codeUnitFromCharCode(HIGH_SURROGATE_START + Math.floor(offset / 0x400)) +
    codeUnitFromCharCode(LOW_SURROGATE_START + (offset % 0x400))
  );
}

/**
 * The Final_Sigma condition of Unicode's SpecialCasing.txt: the sigma is
 * preceded by a cased letter, ignoring any case-ignorable characters in
 * between, and is *not* followed by a cased letter under the same rule.
 *
 * @param {readonly number[]} codePoints
 * @param {number} position
 * @returns {boolean}
 */
function isFinalSigma(codePoints, position) {
  let before = position - 1;

  while (before >= 0 && inRanges(caseIgnorableRanges, codePoints[before])) {
    before -= 1;
  }

  if (before < 0 || !inRanges(casedRanges, codePoints[before])) {
    return false;
  }

  let after = position + 1;

  while (
    after < codePoints.length &&
    inRanges(caseIgnorableRanges, codePoints[after])
  ) {
    after += 1;
  }

  return (
    after >= codePoints.length || !inRanges(casedRanges, codePoints[after])
  );
}

/**
 * @param {string} value
 * @param {Map<number, number>} simple
 * @param {Map<number, number[]>} special
 * @param {boolean} lowercase
 * @returns {string}
 */
function convertCase(value, simple, special, lowercase) {
  const codePoints = toCodePoints(value);
  let result = '';

  for (let position = 0; position < codePoints.length; position += 1) {
    const codePoint = codePoints[position];

    if (
      lowercase &&
      codePoint === CAPITAL_SIGMA &&
      isFinalSigma(codePoints, position)
    ) {
      result += fromCodePoint(FINAL_SIGMA);
      continue;
    }

    const expansion = special.get(codePoint);

    if (expansion !== undefined) {
      for (const unit of expansion) {
        result += fromCodePoint(unit);
      }

      continue;
    }

    const mapped = simple.get(codePoint);

    result += fromCodePoint(mapped === undefined ? codePoint : mapped);
  }

  return result;
}

/**
 * ES5 15.5.4.16 (and 15.5.4.17, which this engine answers identically: it has
 * no locale of its own and must not adopt the host's, so the locale variants
 * are documented deterministic aliases).
 *
 * @param {string} value
 * @returns {string}
 */
export function toLowerCaseString(value) {
  return convertCase(value, simpleLowercase, specialLowercase, true);
}

/**
 * ES5 15.5.4.18 (and 15.5.4.19, the same alias relationship).
 *
 * @param {string} value
 * @returns {string}
 */
export function toUpperCaseString(value) {
  return convertCase(value, simpleUppercase, specialUppercase, false);
}
