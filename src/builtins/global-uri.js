import { toString } from '../runtime/conversion.js';
import {
  charCodeOfCodeUnit,
  codeUnitFromCharCode,
  codeUnitsBetween,
} from '../runtime/code-units.js';
import { GuestErrorSignal } from '../runtime/completion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{
 *   encodeURIFunction: NativeFunction,
 *   encodeURIComponentFunction: NativeFunction,
 *   decodeURIFunction: NativeFunction,
 *   decodeURIComponentFunction: NativeFunction,
 *   escapeFunction: NativeFunction,
 *   unescapeFunction: NativeFunction,
 * }} URIGlobalIntrinsics
 */

/**
 * Builds the set of code unit values a literal character set denotes.
 *
 * The argument is a host literal written by this module, never guest data,
 * and it is read one bracket-indexed code unit at a time so no host String
 * method is involved.
 *
 * @param {string} characters
 * @returns {Set<number>}
 */
function codeSetOf(characters) {
  /** @type {Set<number>} */
  const codes = new Set();

  for (let index = 0; index < characters.length; index += 1) {
    codes.add(charCodeOfCodeUnit(characters[index]));
  }

  return codes;
}

const UPPERCASE_A = 0x41;
const UPPERCASE_Z = 0x5a;
const LOWERCASE_A = 0x61;
const LOWERCASE_Z = 0x7a;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

const LEADING_SURROGATE_FIRST = 0xd800;
const LEADING_SURROGATE_LAST = 0xdbff;
const TRAILING_SURROGATE_FIRST = 0xdc00;
const TRAILING_SURROGATE_LAST = 0xdfff;

/** The first code point that needs a surrogate pair in UTF-16. */
const SUPPLEMENTARY_FIRST = 0x10000;
/** The last code point Unicode defines. */
const CODE_POINT_LAST = 0x10ffff;

/** `uriReserved` (ES5 15.1.3): the characters that delimit a URI's parts. */
const URI_RESERVED = codeSetOf(';/?:@&=+$,');

/** `uriMark` (ES5 15.1.3): the punctuation a URI may carry unescaped. */
const URI_MARK = codeSetOf("-_.!~*'()");

/** `#` is not `uriReserved`, but 15.1.3 gives it the same treatment. */
const NUMBER_SIGN = charCodeOfCodeUnit('#');

/**
 * The `unescapedURISet`/`reservedURISet` pairs of ES5 15.1.3.
 *
 * `encodeURI` preserves anything that could be structurally meaningful in a
 * complete URI, so its unescaped set is `uriReserved ∪ uriUnescaped ∪ {"#"}`.
 * `encodeURIComponent` escapes a single *component*, where a reserved
 * character would be data rather than structure, so its set is just
 * `uriUnescaped`. The decode functions mirror that: whatever `encodeURI`
 * refused to escape, `decodeURI` refuses to unescape, so that
 * `decodeURI(encodeURI(s))` is `s` for every `s` either one accepts.
 */
const ENCODE_URI_PRESERVED = new Set([
  ...URI_RESERVED,
  ...URI_MARK,
  NUMBER_SIGN,
]);
const ENCODE_URI_COMPONENT_PRESERVED = new Set(URI_MARK);
const DECODE_URI_RESERVED = new Set([...URI_RESERVED, NUMBER_SIGN]);
/** @type {Set<number>} */
const DECODE_URI_COMPONENT_RESERVED = new Set();

/**
 * The Annex B B.2.1 unescaped set: alphanumerics plus `@*_+-./`.
 *
 * It is neither a superset nor a subset of `uriUnescaped` -- `escape` keeps
 * `@+/` which `encodeURIComponent` escapes, and escapes `!~'()` which every
 * URI function keeps -- which is exactly why `escape` cannot be expressed in
 * terms of `encodeURIComponent`.
 */
const ESCAPE_PRESERVED = codeSetOf('@*_+-./');

/** The largest code unit `escape` renders in the two-digit `%XX` form. */
const ESCAPE_TWO_DIGIT_LAST = 0xff;

const PERCENT = charCodeOfCodeUnit('%');
const LOWERCASE_U = charCodeOfCodeUnit('u');

const HEX_DIGITS = '0123456789ABCDEF';

/**
 * @param {number} code
 * @returns {boolean}
 */
function isAsciiAlphanumeric(code) {
  return (
    (code >= UPPERCASE_A && code <= UPPERCASE_Z) ||
    (code >= LOWERCASE_A && code <= LOWERCASE_Z) ||
    (code >= DIGIT_ZERO && code <= DIGIT_NINE)
  );
}

/**
 * @param {number} code
 * @returns {boolean}
 */
function isLeadingSurrogate(code) {
  return code >= LEADING_SURROGATE_FIRST && code <= LEADING_SURROGATE_LAST;
}

/**
 * @param {number} code
 * @returns {boolean}
 */
function isTrailingSurrogate(code) {
  return code >= TRAILING_SURROGATE_FIRST && code <= TRAILING_SURROGATE_LAST;
}

/**
 * The value of one hexadecimal digit, or `-1` when the code unit is not one.
 *
 * @param {number} code
 * @returns {number}
 */
function hexDigitValue(code) {
  if (code >= DIGIT_ZERO && code <= DIGIT_NINE) {
    return code - DIGIT_ZERO;
  }

  if (code >= UPPERCASE_A && code <= UPPERCASE_A + 5) {
    return code - UPPERCASE_A + 10;
  }

  if (code >= LOWERCASE_A && code <= LOWERCASE_A + 5) {
    return code - LOWERCASE_A + 10;
  }

  return -1;
}

/**
 * Renders `value` as exactly `width` uppercase hexadecimal digits.
 *
 * ES5 15.1.3 specifies uppercase for every escape these functions produce,
 * and the digits are assembled from `HEX_DIGITS` by index rather than from
 * `Number.prototype.toString(16)` so the case is this module's decision
 * rather than the host's.
 *
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
function toHexDigits(value, width) {
  let text = '';

  for (let shift = width - 1; shift >= 0; shift -= 1) {
    text += HEX_DIGITS[(value >> (shift * 4)) & 0xf];
  }

  return text;
}

/**
 * Reads the two hexadecimal digits at `index + 1` and `index + 2` of a
 * percent escape whose `%` is at `index`, or `-1` when they are missing or
 * are not hexadecimal.
 *
 * @param {string} value
 * @param {number} index
 * @returns {number}
 */
function readHexPair(value, index) {
  if (index + 2 >= value.length) {
    return -1;
  }

  const high = hexDigitValue(charCodeOfCodeUnit(value[index + 1]));
  const low = hexDigitValue(charCodeOfCodeUnit(value[index + 2]));

  if (high < 0 || low < 0) {
    return -1;
  }

  return high * 16 + low;
}

/**
 * @param {string} message
 * @returns {never}
 */
function throwURIError(message) {
  throw new GuestErrorSignal('URIError', message);
}

/**
 * ES5 15.1.3.4 `Encode`.
 *
 * Every code unit outside `preserved` is converted to its code point --
 * pairing surrogates, and raising a `URIError` for any surrogate that is not
 * half of a well-formed pair -- and that code point is written as the UTF-8
 * octets of its encoding, each octet as `%XX`.
 *
 * @param {string} value
 * @param {Set<number>} preserved
 * @returns {string}
 */
function encode(value, preserved) {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeOfCodeUnit(value[index]);

    if (preserved.has(code) || isAsciiAlphanumeric(code)) {
      result += value[index];
      continue;
    }

    let codePoint = code;

    if (isTrailingSurrogate(code)) {
      // A trailing surrogate can only be reached here when nothing consumed
      // it as the second half of a pair, so it is unpaired by construction.
      throwURIError('URI malformed: unpaired trailing surrogate');
    }

    if (isLeadingSurrogate(code)) {
      if (index + 1 >= value.length) {
        throwURIError('URI malformed: leading surrogate at end of string');
      }

      const next = charCodeOfCodeUnit(value[index + 1]);

      if (!isTrailingSurrogate(next)) {
        throwURIError(
          'URI malformed: leading surrogate without a trailing one',
        );
      }

      codePoint =
        (code - LEADING_SURROGATE_FIRST) * 0x400 +
        (next - TRAILING_SURROGATE_FIRST) +
        SUPPLEMENTARY_FIRST;
      index += 1;
    }

    for (const octet of utf8OctetsOf(codePoint)) {
      result += `%${toHexDigits(octet, 2)}`;
    }
  }

  return result;
}

/**
 * The UTF-8 octets of one code point, in the shortest form that encodes it.
 *
 * @param {number} codePoint
 * @returns {number[]}
 */
function utf8OctetsOf(codePoint) {
  if (codePoint <= 0x7f) {
    return [codePoint];
  }

  if (codePoint <= 0x7ff) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }

  if (codePoint <= 0xffff) {
    return [
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ];
  }

  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

/**
 * The number of octets a UTF-8 sequence starting with `octet` occupies, or
 * `-1` when `octet` cannot start one.
 *
 * ES5 15.1.3.3's table stops at four octets, and the five- and six-octet
 * forms of the original UTF-8 draft (`F8`-`FD`) are not valid UTF-8 today,
 * so every leading octet above `F7` -- along with the continuation octets
 * `80`-`BF`, which cannot lead a sequence, and `FE`/`FF`, which never appear
 * in UTF-8 at all -- is rejected here.
 *
 * @param {number} octet
 * @returns {number}
 */
function utf8SequenceLength(octet) {
  if (octet <= 0x7f) {
    return 1;
  }

  if (octet >= 0xc0 && octet <= 0xdf) {
    return 2;
  }

  if (octet >= 0xe0 && octet <= 0xef) {
    return 3;
  }

  if (octet >= 0xf0 && octet <= 0xf7) {
    return 4;
  }

  return -1;
}

/**
 * The lowest code point each sequence length is allowed to encode, indexed
 * by that length.
 *
 * Rejecting anything below its entry is what rules out overlong encodings:
 * `C0 80` would decode to U+0000, which a one-octet sequence already
 * encodes, and accepting it is a well-known way to smuggle a NUL (or a `/`,
 * as `C0 AF`) past a filter that only inspected the shortest form.
 */
const UTF8_MINIMUM_CODE_POINT = Object.freeze([0, 0, 0x80, 0x800, 0x10000]);

/**
 * Decodes the UTF-8 sequence whose octets are `octets`, validating that it is
 * the shortest form for its value and that the value is a Unicode scalar.
 *
 * @param {readonly number[]} octets
 * @returns {number}
 */
function codePointOfUtf8(octets) {
  const length = octets.length;
  const leadingBits = [0, 0x7f, 0x1f, 0x0f, 0x07][length];

  let codePoint = octets[0] & leadingBits;

  for (let index = 1; index < length; index += 1) {
    codePoint = (codePoint << 6) | (octets[index] & 0x3f);
  }

  if (codePoint < UTF8_MINIMUM_CODE_POINT[length]) {
    throwURIError('URI malformed: overlong UTF-8 sequence');
  }

  if (codePoint > CODE_POINT_LAST) {
    throwURIError('URI malformed: UTF-8 sequence above U+10FFFF');
  }

  if (isLeadingSurrogate(codePoint) || isTrailingSurrogate(codePoint)) {
    // Surrogates are UTF-16 machinery, not scalar values; UTF-8 has no
    // encoding for them, and CESU-8's is not accepted here.
    throwURIError('URI malformed: UTF-8-encoded surrogate half');
  }

  return codePoint;
}

/**
 * ES5 15.1.3.3 `Decode`.
 *
 * A percent escape whose octet is in `reserved` is copied through *exactly as
 * written* -- the original three code units, hex-digit case included -- so
 * `decodeURI(encodeURI(s))` never turns a reserved character back into the
 * delimiter it would have been parsed as.
 *
 * @param {string} value
 * @param {Set<number>} reserved
 * @returns {string}
 */
function decode(value, reserved) {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeOfCodeUnit(value[index]);

    if (code !== PERCENT) {
      result += value[index];
      continue;
    }

    const start = index;
    const octet = readHexPair(value, index);

    if (octet < 0) {
      throwURIError('URI malformed: incomplete percent escape');
    }

    index += 2;

    const length = utf8SequenceLength(octet);

    if (length < 0) {
      throwURIError('URI malformed: invalid UTF-8 leading octet');
    }

    if (length === 1) {
      if (reserved.has(octet)) {
        result += codeUnitsBetween(value, start, start + 3);
      } else {
        result += codeUnitFromCharCode(octet);
      }

      continue;
    }

    const octets = [octet];

    for (let position = 1; position < length; position += 1) {
      if (
        index + 1 >= value.length ||
        charCodeOfCodeUnit(value[index + 1]) !== PERCENT
      ) {
        throwURIError('URI malformed: truncated UTF-8 sequence');
      }

      const continuation = readHexPair(value, index + 1);

      if (continuation < 0) {
        throwURIError('URI malformed: incomplete percent escape');
      }

      if (continuation < 0x80 || continuation > 0xbf) {
        throwURIError('URI malformed: expected a UTF-8 continuation octet');
      }

      octets.push(continuation);
      index += 3;
    }

    const codePoint = codePointOfUtf8(octets);

    if (codePoint < SUPPLEMENTARY_FIRST) {
      // Reserved characters are all one octet, so a multi-octet sequence can
      // never be one; it decodes unconditionally.
      result += codeUnitFromCharCode(codePoint);
      continue;
    }

    const offset = codePoint - SUPPLEMENTARY_FIRST;

    result += codeUnitFromCharCode(
      LEADING_SURROGATE_FIRST + ((offset >> 10) & 0x3ff),
    );
    result += codeUnitFromCharCode(TRAILING_SURROGATE_FIRST + (offset & 0x3ff));
  }

  return result;
}

/**
 * Annex B B.2.1 `escape`.
 *
 * Unlike `encodeURI`, this works one UTF-16 code unit at a time and never
 * pairs surrogates: an astral character becomes two `%uXXXX` escapes, one
 * per half. That is why it is not a URI encoder and why the URI functions
 * exist.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeString(value) {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeOfCodeUnit(value[index]);

    if (isAsciiAlphanumeric(code) || ESCAPE_PRESERVED.has(code)) {
      result += value[index];
    } else if (code > ESCAPE_TWO_DIGIT_LAST) {
      result += `%u${toHexDigits(code, 4)}`;
    } else {
      result += `%${toHexDigits(code, 2)}`;
    }
  }

  return result;
}

/**
 * Annex B B.2.2 `unescape`.
 *
 * Nothing here is an error: an escape that is incomplete or not hexadecimal
 * is copied through verbatim, one code unit at a time, which is what makes
 * `unescape` total where `decodeURI` is partial.
 *
 * @param {string} value
 * @returns {string}
 */
function unescapeString(value) {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    if (charCodeOfCodeUnit(value[index]) !== PERCENT) {
      result += value[index];
      continue;
    }

    if (
      index + 5 < value.length &&
      charCodeOfCodeUnit(value[index + 1]) === LOWERCASE_U
    ) {
      const high = readHexPair(value, index + 1);
      const low = readHexPair(value, index + 3);

      if (high >= 0 && low >= 0) {
        result += codeUnitFromCharCode(high * 256 + low);
        index += 5;
        continue;
      }
    }

    const octet = readHexPair(value, index);

    if (octet >= 0) {
      result += codeUnitFromCharCode(octet);
      index += 2;
      continue;
    }

    result += value[index];
  }

  return result;
}

/**
 * Builds this realm's four URI functions (ES5 15.1.3) and the two Annex B
 * `escape`/`unescape` functions (B.2.1/B.2.2).
 *
 * None of them delegates to the host functions of the same name. Host
 * `encodeURI` and `decodeURI` are close to the specification but not bound
 * to it -- the octet-sequence validation `decodeURI` performs is exactly the
 * kind of thing hosts have historically differed on -- and host `escape` is
 * an Annex B function whose behaviour is normative here but merely
 * conventional there. Writing the UTF-8 and UTF-16 conversions out makes
 * every one of those decisions this engine's, and identical on every host.
 *
 * @param {Realm} realm
 * @returns {URIGlobalIntrinsics}
 */
export function createURIGlobalIntrinsics(realm) {
  /**
   * @param {string} name
   * @param {(value: string) => string} transform
   * @returns {NativeFunction}
   */
  const stringFunction = (name, transform) =>
    realm.createNativeFunction({
      name,
      length: 1,
      call(_thisValue, args) {
        return transform(toString(args[0]));
      },
    });

  return {
    encodeURIFunction: stringFunction('encodeURI', (value) =>
      encode(value, ENCODE_URI_PRESERVED),
    ),
    encodeURIComponentFunction: stringFunction('encodeURIComponent', (value) =>
      encode(value, ENCODE_URI_COMPONENT_PRESERVED),
    ),
    decodeURIFunction: stringFunction('decodeURI', (value) =>
      decode(value, DECODE_URI_RESERVED),
    ),
    decodeURIComponentFunction: stringFunction('decodeURIComponent', (value) =>
      decode(value, DECODE_URI_COMPONENT_RESERVED),
    ),
    escapeFunction: stringFunction('escape', escapeString),
    unescapeFunction: stringFunction('unescape', unescapeString),
  };
}

/**
 * Publishes the six functions on the global object with ES5 15.1's standard
 * attributes for a global function property.
 *
 * @param {EngineObject} globalObject
 * @param {URIGlobalIntrinsics} intrinsics
 * @returns {void}
 */
export function installURIGlobals(globalObject, intrinsics) {
  /** @type {[string, NativeFunction][]} */
  const entries = [
    ['encodeURI', intrinsics.encodeURIFunction],
    ['encodeURIComponent', intrinsics.encodeURIComponentFunction],
    ['decodeURI', intrinsics.decodeURIFunction],
    ['decodeURIComponent', intrinsics.decodeURIComponentFunction],
    ['escape', intrinsics.escapeFunction],
    ['unescape', intrinsics.unescapeFunction],
  ];

  for (const [name, value] of entries) {
    globalObject.defineOwnProperty(name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}
