import { EngineObject } from '../runtime/object.js';
import { EngineArray } from '../runtime/array-object.js';
import {
  toInteger,
  toNumber,
  toString,
  toUint32,
} from '../runtime/conversion.js';
import {
  charCodeOfCodeUnit,
  codeUnitFromCharCode,
  codeUnitsBetween,
} from '../runtime/code-units.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { isCallable } from '../runtime/descriptors.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 * @typedef {import('../runtime/descriptors.js').CallableLike} CallableLike
 *
 * @typedef {{
 *   jsonObject: EngineObject,
 *   jsonParseFunction: NativeFunction,
 *   jsonStringifyFunction: NativeFunction,
 * }} JSONIntrinsics
 *
 * @typedef {{ text: string, index: number }} ParserState
 *
 * @typedef {{
 *   stack: Set<EngineObject>,
 *   indent: string,
 *   gap: string,
 *   propertyList: string[] | undefined,
 *   replacerFunction: CallableLike | undefined,
 * }} SerializerState
 */

/**
 * `JSONWhiteSpace` (ES5 15.12.1.1) is exactly these four code units.
 *
 * This is a far smaller set than the language's own `WhiteSpace` — no
 * no-break space, no BOM, no `Zs` category, no line/paragraph separator — so
 * `JSON.parse("\u00a01")` is a `SyntaxError` even though `Number("\u00a01")`
 * is `1`. Reusing the language's whitespace set here is the single easiest
 * way to write a JSON parser that accepts text no other implementation does.
 */
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;

/** The last code unit `JSONStringCharacter` excludes as an unescaped control. */
const LAST_JSON_CONTROL = 0x1f;

const QUOTATION_MARK = 0x22;
const PLUS_SIGN = 0x2b;
const COMMA = 0x2c;
const HYPHEN_MINUS = 0x2d;
const FULL_STOP = 0x2e;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;
const COLON = 0x3a;
const UPPERCASE_A = 0x41;
const UPPERCASE_E = 0x45;
const LEFT_SQUARE_BRACKET = 0x5b;
const REVERSE_SOLIDUS = 0x5c;
const RIGHT_SQUARE_BRACKET = 0x5d;
const LOWERCASE_A = 0x61;
const LOWERCASE_E = 0x65;
const LOWERCASE_U = 0x75;
const LEFT_CURLY_BRACKET = 0x7b;
const RIGHT_CURLY_BRACKET = 0x7d;

/**
 * `JSONEscapeCharacter` and the code unit each one denotes (ES5 15.12.1.1).
 *
 * JSON's escape set is a strict subset of the language's: there is no `\v`,
 * no `\0`, no `\x41`, and no line continuation, and `\'` is not an escape
 * because a JSON string cannot be single-quoted in the first place.
 */
const SINGLE_CHARACTER_ESCAPES = new Map([
  [QUOTATION_MARK, '"'],
  [REVERSE_SOLIDUS, '\\'],
  [0x2f, '/'],
  [0x62, '\b'],
  [0x66, '\f'],
  [0x6e, '\n'],
  [0x72, '\r'],
  [0x74, '\t'],
]);

/**
 * The code unit at `index`, or `-1` when `index` is past the end.
 *
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function codeAt(text, index) {
  if (index < 0 || index >= text.length) {
    return -1;
  }

  return charCodeOfCodeUnit(text[index]);
}

/**
 * @param {ParserState} state
 * @param {string} message
 * @returns {never}
 */
function throwSyntaxError(state, message) {
  throw new GuestErrorSignal(
    'SyntaxError',
    `Unexpected token in JSON at position ${state.index}: ${message}`,
  );
}

/**
 * @param {number} code
 * @returns {boolean}
 */
function isDecimalDigit(code) {
  return code >= DIGIT_ZERO && code <= DIGIT_NINE;
}

/**
 * @param {number} code
 * @returns {number} The digit's value, or `-1` when it is not a hex digit.
 */
function hexDigitValue(code) {
  if (isDecimalDigit(code)) {
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
 * @param {ParserState} state
 * @returns {void}
 */
function skipWhiteSpace(state) {
  while (state.index < state.text.length) {
    const code = charCodeOfCodeUnit(state.text[state.index]);

    if (
      code !== TAB &&
      code !== LINE_FEED &&
      code !== CARRIAGE_RETURN &&
      code !== SPACE
    ) {
      return;
    }

    state.index += 1;
  }
}

/**
 * Reads a `JSONString` (ES5 15.12.1.1), with `state.index` on its opening
 * quotation mark.
 *
 * @param {ParserState} state
 * @returns {string}
 */
function parseJSONString(state) {
  state.index += 1;

  let result = '';

  for (;;) {
    const code = codeAt(state.text, state.index);

    if (code < 0) {
      throwSyntaxError(state, 'unterminated string');
    }

    if (code === QUOTATION_MARK) {
      state.index += 1;
      return result;
    }

    if (code <= LAST_JSON_CONTROL) {
      // A raw control character has to be escaped in JSON, which is what
      // makes a JSON string safe to embed in a line-oriented format.
      throwSyntaxError(state, 'unescaped control character in string');
    }

    if (code !== REVERSE_SOLIDUS) {
      result += state.text[state.index];
      state.index += 1;
      continue;
    }

    state.index += 1;

    const escape = codeAt(state.text, state.index);
    const single = SINGLE_CHARACTER_ESCAPES.get(escape);

    if (single !== undefined) {
      result += single;
      state.index += 1;
      continue;
    }

    if (escape !== LOWERCASE_U) {
      throwSyntaxError(state, 'invalid escape sequence');
    }

    state.index += 1;

    let value = 0;

    for (let digit = 0; digit < 4; digit += 1) {
      const digitValue = hexDigitValue(codeAt(state.text, state.index));

      if (digitValue < 0) {
        throwSyntaxError(state, 'invalid unicode escape sequence');
      }

      value = value * 16 + digitValue;
      state.index += 1;
    }

    // A `\uXXXX` escape names a code *unit*, so an unpaired surrogate is
    // well-formed JSON text and produces an unpaired surrogate.
    result += codeUnitFromCharCode(value);
  }
}

/**
 * Reads a `JSONNumber` (ES5 15.12.1.1), with `state.index` on its first code
 * unit.
 *
 * The scanned text is handed to the engine's own `ToNumber` for its
 * mathematical value: every `JSONNumber` is also a `StrDecimalLiteral`, so
 * the two agree by construction, and the rounding is then the same correctly
 * rounded conversion `Number("...")` performs rather than a second one
 * written here.
 *
 * @param {ParserState} state
 * @returns {number}
 */
function parseJSONNumber(state) {
  const start = state.index;

  if (codeAt(state.text, state.index) === HYPHEN_MINUS) {
    state.index += 1;
  }

  const firstDigit = codeAt(state.text, state.index);

  if (!isDecimalDigit(firstDigit)) {
    throwSyntaxError(state, 'expected a digit');
  }

  if (firstDigit === DIGIT_ZERO) {
    // `DecimalIntegerLiteral :: 0` — a second digit would make this a legacy
    // octal literal in JavaScript, which JSON deliberately has no form for.
    state.index += 1;
  } else {
    while (isDecimalDigit(codeAt(state.text, state.index))) {
      state.index += 1;
    }
  }

  if (codeAt(state.text, state.index) === FULL_STOP) {
    state.index += 1;

    if (!isDecimalDigit(codeAt(state.text, state.index))) {
      throwSyntaxError(state, 'expected a digit after the decimal point');
    }

    while (isDecimalDigit(codeAt(state.text, state.index))) {
      state.index += 1;
    }
  }

  const exponent = codeAt(state.text, state.index);

  if (exponent === LOWERCASE_E || exponent === UPPERCASE_E) {
    state.index += 1;

    const sign = codeAt(state.text, state.index);

    if (sign === PLUS_SIGN || sign === HYPHEN_MINUS) {
      state.index += 1;
    }

    if (!isDecimalDigit(codeAt(state.text, state.index))) {
      throwSyntaxError(state, 'expected a digit in the exponent');
    }

    while (isDecimalDigit(codeAt(state.text, state.index))) {
      state.index += 1;
    }
  }

  return toNumber(codeUnitsBetween(state.text, start, state.index));
}

/**
 * Consumes `keyword` when the text at `state.index` is exactly it.
 *
 * @param {ParserState} state
 * @param {string} keyword
 * @returns {boolean}
 */
function consumeKeyword(state, keyword) {
  for (let offset = 0; offset < keyword.length; offset += 1) {
    if (
      codeAt(state.text, state.index + offset) !==
      charCodeOfCodeUnit(keyword[offset])
    ) {
      return false;
    }
  }

  state.index += keyword.length;

  return true;
}

/**
 * @param {Realm} realm
 * @param {ParserState} state
 * @returns {EngineObject}
 */
function parseJSONObject(realm, state) {
  const object = new EngineObject(realm.intrinsics.objectPrototype, 'Object');

  state.index += 1;
  skipWhiteSpace(state);

  if (codeAt(state.text, state.index) === RIGHT_CURLY_BRACKET) {
    state.index += 1;
    return object;
  }

  for (;;) {
    skipWhiteSpace(state);

    if (codeAt(state.text, state.index) !== QUOTATION_MARK) {
      throwSyntaxError(state, 'expected a double-quoted property name');
    }

    const key = parseJSONString(state);

    skipWhiteSpace(state);

    if (codeAt(state.text, state.index) !== COLON) {
      throwSyntaxError(state, 'expected ":" after a property name');
    }

    state.index += 1;

    const value = parseJSONValue(realm, state);

    // A repeated name keeps the last value, which is what re-defining an
    // ordinary data property does.
    object.defineOwnProperty(key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    skipWhiteSpace(state);

    const next = codeAt(state.text, state.index);

    if (next === COMMA) {
      state.index += 1;
      continue;
    }

    if (next === RIGHT_CURLY_BRACKET) {
      state.index += 1;
      return object;
    }

    throwSyntaxError(state, 'expected "," or "}" in object');
  }
}

/**
 * @param {Realm} realm
 * @param {ParserState} state
 * @returns {EngineArray}
 */
function parseJSONArray(realm, state) {
  const array = new EngineArray(realm.intrinsics.arrayPrototype);

  state.index += 1;
  skipWhiteSpace(state);

  if (codeAt(state.text, state.index) === RIGHT_SQUARE_BRACKET) {
    state.index += 1;
    return array;
  }

  let index = 0;

  for (;;) {
    const value = parseJSONValue(realm, state);

    array.defineOwnProperty(String(index), {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    index += 1;

    skipWhiteSpace(state);

    const next = codeAt(state.text, state.index);

    if (next === COMMA) {
      state.index += 1;
      continue;
    }

    if (next === RIGHT_SQUARE_BRACKET) {
      state.index += 1;
      return array;
    }

    throwSyntaxError(state, 'expected "," or "]" in array');
  }
}

/**
 * Reads one `JSONValue`, skipping the whitespace before it but not after.
 *
 * @param {Realm} realm
 * @param {ParserState} state
 * @returns {unknown}
 */
function parseJSONValue(realm, state) {
  // Objects and arrays nest, so this parser's host recursion follows the shape
  // of the *text* a guest passes in rather than the shape of its source. It
  // enters the realm's stack budget for the same reason the evaluator does:
  // otherwise `JSON.parse` is a way to reach a host overflow with a guest
  // string. See `src/runtime/stack-guard.js`.
  const guard = realm.stackGuard;

  guard.enter();

  try {
    return parseJSONValueBody(realm, state);
  } finally {
    guard.exit();
  }
}

/**
 * @param {Realm} realm
 * @param {ParserState} state
 * @returns {unknown}
 */
function parseJSONValueBody(realm, state) {
  skipWhiteSpace(state);

  const code = codeAt(state.text, state.index);

  if (code === LEFT_CURLY_BRACKET) {
    return parseJSONObject(realm, state);
  }

  if (code === LEFT_SQUARE_BRACKET) {
    return parseJSONArray(realm, state);
  }

  if (code === QUOTATION_MARK) {
    return parseJSONString(state);
  }

  if (code === HYPHEN_MINUS || isDecimalDigit(code)) {
    return parseJSONNumber(state);
  }

  if (consumeKeyword(state, 'null')) {
    return null;
  }

  if (consumeKeyword(state, 'true')) {
    return true;
  }

  if (consumeKeyword(state, 'false')) {
    return false;
  }

  throwSyntaxError(state, 'expected a JSON value');
}

/**
 * ES5 15.12.2 step 2: parse `text` as a complete `JSONText`.
 *
 * @param {Realm} realm
 * @param {string} text
 * @returns {unknown}
 */
function parseJSONText(realm, text) {
  /** @type {ParserState} */
  const state = { text, index: 0 };

  const value = parseJSONValue(realm, state);

  skipWhiteSpace(state);

  if (state.index !== text.length) {
    throwSyntaxError(state, 'unexpected trailing content');
  }

  return value;
}

/**
 * ES5 15.12.2's `Walk`: a post-order traversal that hands every key to
 * `reviver` with its holder as the `this` value, innermost first.
 *
 * A property whose revived value is `undefined` is deleted rather than set,
 * which for an array leaves a hole and does *not* shorten it — the traversal
 * captures an array's length or an object's key list before it starts, so a
 * reviver that mutates the structure cannot make the walk revisit or skip a
 * key.
 *
 * @param {Realm} realm
 * @param {EngineObject} holder
 * @param {string} name
 * @param {import('../runtime/descriptors.js').CallableLike} reviver
 * @returns {unknown}
 */
function walk(realm, holder, name, reviver) {
  // The traversal descends with the revived structure, so — like the parser
  // that built it — its host recursion is bounded by runtime data. Each level
  // takes a frame of the realm's stack budget. The reviver call at the end of
  // this function does too, but only for as long as it runs, so it cannot
  // account for the traversal itself.
  const guard = realm.stackGuard;

  guard.enter();

  try {
    return walkBody(realm, holder, name, reviver);
  } finally {
    guard.exit();
  }
}

/**
 * @param {Realm} realm
 * @param {EngineObject} holder
 * @param {string} name
 * @param {import('../runtime/descriptors.js').CallableLike} reviver
 * @returns {unknown}
 */
function walkBody(realm, holder, name, reviver) {
  const value = holder.get(name);

  if (value instanceof EngineObject) {
    const keys =
      value.getClassName() === 'Array'
        ? arrayIndexKeys(value)
        : enumerableOwnNames(value);

    for (const key of keys) {
      const revived = walk(realm, value, key, reviver);

      if (revived === undefined) {
        value.delete(key, false);
      } else {
        value.defineOwnProperty(
          key,
          {
            value: revived,
            writable: true,
            enumerable: true,
            configurable: true,
          },
          false,
        );
      }
    }
  }

  return reviver.callFunction(holder, [name, value], realm);
}

/**
 * @param {EngineObject} array
 * @returns {Generator<string, void, void>}
 */
function* arrayIndexKeys(array) {
  const length = toUint32(array.get('length'));

  for (let index = 0; index < length; index += 1) {
    yield String(index);
  }
}

/**
 * The own enumerable **string** keys `SerializeJSONObject` walks. ES5.1
 * 15.12.3's `EnumerableOwnNames` had only string keys to return; ES2015
 * 24.3.2 keeps the same answer once symbols exist by enumerating String-typed
 * keys alone. Skipping a symbol key is not the same as rendering it: coercing
 * one with `String(key)` would fabricate the string key its description
 * happens to spell, which can already exist on the same object — emitting
 * that key twice and running its getter twice.
 *
 * @param {EngineObject} object
 * @returns {string[]}
 */
function enumerableOwnNames(object) {
  /** @type {string[]} */
  const names = [];

  for (const key of object.ownPropertyKeys()) {
    if (typeof key !== 'string') {
      continue;
    }

    if (object.getOwnProperty(key)?.enumerable === true) {
      names.push(key);
    }
  }

  return names;
}

/**
 * ES5 15.12.2 `JSON.parse(text [, reviver])`.
 *
 * @param {Realm} realm
 * @param {unknown} textArgument
 * @param {unknown} reviver
 * @returns {unknown}
 */
function jsonParse(realm, textArgument, reviver) {
  const unfiltered = parseJSONText(realm, toString(textArgument));

  if (!isCallable(reviver)) {
    return unfiltered;
  }

  const root = new EngineObject(realm.intrinsics.objectPrototype, 'Object');

  root.defineOwnProperty('', {
    value: unfiltered,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return walk(realm, root, '', reviver);
}

/**
 * The escapes `Quote` (ES5 15.12.3) emits for the characters that cannot
 * appear literally in a JSON string.
 *
 * Every other code unit is written as-is, which is why an unpaired surrogate
 * comes back out of this engine unescaped: escaping it is ES2019's
 * well-formed-`JSON.stringify` change, not ES5's.
 */
const QUOTE_ESCAPES = new Map([
  [QUOTATION_MARK, '\\"'],
  [REVERSE_SOLIDUS, '\\\\'],
  [0x08, '\\b'],
  [0x0c, '\\f'],
  [LINE_FEED, '\\n'],
  [CARRIAGE_RETURN, '\\r'],
  [TAB, '\\t'],
]);

const LOWERCASE_HEX_DIGITS = '0123456789abcdef';

/** ES5 15.12.3 step 6: the widest gap `space` can ask for. */
const MAXIMUM_GAP_WIDTH = 10;

/**
 * ES5 15.12.3 `Quote`: wraps `value` in double quotes, escaping only what
 * JSON requires.
 *
 * @param {string} value
 * @returns {string}
 */
function quote(value) {
  let product = '"';

  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeOfCodeUnit(value[index]);
    const escape = QUOTE_ESCAPES.get(code);

    if (escape !== undefined) {
      product += escape;
    } else if (code <= LAST_JSON_CONTROL) {
      let digits = '';

      for (let shift = 3; shift >= 0; shift -= 1) {
        digits += LOWERCASE_HEX_DIGITS[(code >> (shift * 4)) & 0xf];
      }

      product += `\\u${digits}`;
    } else {
      product += value[index];
    }
  }

  return `${product}"`;
}

/**
 * ES5 15.12.3 `Str`: the JSON text for one key of one holder, or `undefined`
 * when the value has no JSON form.
 *
 * The order here is guest-observable and fixed: `toJSON` runs before the
 * replacer, and the replacer runs before a wrapper object is unwrapped, so a
 * `Number` object with a `toJSON` never has its `valueOf` called at all.
 *
 * @param {Realm} realm
 * @param {SerializerState} state
 * @param {string} key
 * @param {EngineObject} holder
 * @returns {string | undefined}
 */
function serializeProperty(realm, state, key, holder) {
  // Objects and arrays nest, so serialisation recurses with the shape of the
  // runtime value, not of any source. Without a frame of the realm's stack
  // budget per level, a deep enough guest structure would reach a host
  // overflow through `JSON.stringify`.
  const guard = realm.stackGuard;

  guard.enter();

  try {
    return serializePropertyBody(realm, state, key, holder);
  } finally {
    guard.exit();
  }
}

/**
 * @param {Realm} realm
 * @param {SerializerState} state
 * @param {string} key
 * @param {EngineObject} holder
 * @returns {string | undefined}
 */
function serializePropertyBody(realm, state, key, holder) {
  let value = holder.get(key);

  if (value instanceof EngineObject) {
    const toJSON = value.get('toJSON');

    if (isCallable(toJSON)) {
      value = toJSON.callFunction(value, [key], realm);
    }
  }

  if (state.replacerFunction !== undefined) {
    value = state.replacerFunction.callFunction(holder, [key, value], realm);
  }

  if (value instanceof EngineObject) {
    const className = value.getClassName();

    if (className === 'Number') {
      value = toNumber(value);
    } else if (className === 'String') {
      value = toString(value);
    } else if (className === 'Boolean') {
      value = /** @type {{ primitiveValue: boolean }} */ (
        /** @type {unknown} */ (value)
      ).primitiveValue;
    }
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'string') {
    return quote(value);
  }

  if (typeof value === 'number') {
    // NaN and the infinities have no JSON literal, so they are written as
    // null rather than as text no parser would read back.
    return Number.isFinite(value) ? toString(value) : 'null';
  }

  if (value instanceof EngineObject && !isCallable(value)) {
    return value.getClassName() === 'Array'
      ? serializeArray(realm, state, value)
      : serializeObject(realm, state, value);
  }

  return undefined;
}

/**
 * Adds `value` to the set of structures currently being serialised, or throws
 * the `TypeError` ES5 15.12.3's `JO`/`JA` step 1 requires when it is already
 * there.
 *
 * The specification calls this a stack, but membership is the only question
 * ever asked of it and a structure can be on it at most once — being on it
 * twice is precisely the cycle this rejects — so a set answers that question
 * in constant time and behaves identically.
 *
 * @param {SerializerState} state
 * @param {EngineObject} value
 * @returns {void}
 */
function enterStructure(state, value) {
  if (state.stack.has(value)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Converting circular structure to JSON',
    );
  }

  state.stack.add(value);
}

/**
 * Joins the already-serialised members of one object or array with the
 * bracket pair and indentation ES5 15.12.3 specifies.
 *
 * @param {SerializerState} state
 * @param {readonly string[]} partial
 * @param {string} stepback
 * @param {string} open
 * @param {string} close
 * @returns {string}
 */
function wrapPartial(state, partial, stepback, open, close) {
  if (partial.length === 0) {
    return `${open}${close}`;
  }

  if (state.gap === '') {
    return `${open}${partial.join(',')}${close}`;
  }

  const separator = `,\n${state.indent}`;

  return `${open}\n${state.indent}${partial.join(separator)}\n${stepback}${close}`;
}

/**
 * ES5 15.12.3 `JO`.
 *
 * @param {Realm} realm
 * @param {SerializerState} state
 * @param {EngineObject} value
 * @returns {string}
 */
function serializeObject(realm, state, value) {
  enterStructure(state, value);

  const stepback = state.indent;

  state.indent += state.gap;

  const keys = state.propertyList ?? enumerableOwnNames(value);

  /** @type {string[]} */
  const partial = [];

  for (const key of keys) {
    const text = serializeProperty(realm, state, key, value);

    if (text !== undefined) {
      partial.push(`${quote(key)}:${state.gap === '' ? '' : ' '}${text}`);
    }
  }

  const final = wrapPartial(state, partial, stepback, '{', '}');

  state.stack.delete(value);
  state.indent = stepback;

  return final;
}

/**
 * ES5 15.12.3 `JA`.
 *
 * A `PropertyList` never applies here: an array's contents are its indices,
 * so a replacer array filters the objects *inside* an array but never the
 * array's own elements.
 *
 * @param {Realm} realm
 * @param {SerializerState} state
 * @param {EngineObject} value
 * @returns {string}
 */
function serializeArray(realm, state, value) {
  enterStructure(state, value);

  const stepback = state.indent;

  state.indent += state.gap;

  const length = toUint32(value.get('length'));

  /** @type {string[]} */
  const partial = [];

  for (let index = 0; index < length; index += 1) {
    // A hole, an undefined, and a function are all "no JSON form", and an
    // array cannot omit an element without renumbering the rest, so each one
    // becomes null.
    partial.push(
      serializeProperty(realm, state, String(index), value) ?? 'null',
    );
  }

  const final = wrapPartial(state, partial, stepback, '[', ']');

  state.stack.delete(value);
  state.indent = stepback;

  return final;
}

/**
 * ES5 15.12.3 step 4b: the `PropertyList` a replacer array denotes.
 *
 * Only strings, numbers, and `String`/`Number` wrapper objects name a
 * property; a boolean, a null, or a plain object contributes nothing, and a
 * repeated name keeps its first position.
 *
 * @param {EngineObject} replacer
 * @returns {string[]}
 */
function propertyListOf(replacer) {
  /** @type {string[]} */
  const list = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const index of arrayIndexKeys(replacer)) {
    if (!replacer.hasProperty(index)) {
      continue;
    }

    const entry = replacer.get(index);

    /** @type {string | undefined} */
    let item;

    if (typeof entry === 'string') {
      item = entry;
    } else if (typeof entry === 'number') {
      item = toString(entry);
    } else if (entry instanceof EngineObject) {
      const className = entry.getClassName();

      if (className === 'String' || className === 'Number') {
        item = toString(entry);
      }
    }

    if (item !== undefined && !seen.has(item)) {
      seen.add(item);
      list.push(item);
    }
  }

  return list;
}

/**
 * ES5 15.12.3 steps 5-8: the indentation unit `space` describes.
 *
 * @param {unknown} space
 * @returns {string}
 */
function gapOf(space) {
  let normalized = space;

  if (normalized instanceof EngineObject) {
    const className = normalized.getClassName();

    if (className === 'Number') {
      normalized = toNumber(normalized);
    } else if (className === 'String') {
      normalized = toString(normalized);
    }
  }

  if (typeof normalized === 'number') {
    const width = Math.min(MAXIMUM_GAP_WIDTH, toInteger(normalized));

    let gap = '';

    for (let count = 0; count < width; count += 1) {
      gap += ' ';
    }

    return gap;
  }

  if (typeof normalized === 'string') {
    return normalized.length <= MAXIMUM_GAP_WIDTH
      ? normalized
      : codeUnitsBetween(normalized, 0, MAXIMUM_GAP_WIDTH);
  }

  return '';
}

/**
 * ES5 15.12.3 `JSON.stringify(value [, replacer [, space]])`.
 *
 * @param {Realm} realm
 * @param {unknown} value
 * @param {unknown} replacer
 * @param {unknown} space
 * @returns {string | undefined}
 */
function jsonStringify(realm, value, replacer, space) {
  /** @type {SerializerState} */
  const state = {
    stack: new Set(),
    indent: '',
    gap: '',
    propertyList: undefined,
    replacerFunction: undefined,
  };

  if (replacer instanceof EngineObject) {
    if (isCallable(replacer)) {
      state.replacerFunction = replacer;
    } else if (replacer.getClassName() === 'Array') {
      state.propertyList = propertyListOf(replacer);
    }
  }

  state.gap = gapOf(space);

  const wrapper = new EngineObject(realm.intrinsics.objectPrototype, 'Object');

  wrapper.defineOwnProperty('', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return serializeProperty(realm, state, '', wrapper);
}

/**
 * Builds this realm's `JSON` object (ES5 15.12).
 *
 * The parser and the serializer are written out here rather than delegated
 * to host `JSON` for the same reason the rest of this engine is: the objects
 * and arrays a reviver sees have to belong to *this* realm and answer to
 * this engine's `[[DefineOwnProperty]]`, the replacer/`toJSON`/getter call
 * order has to be this engine's, and the grammar has to be JSON's rather
 * than whatever the host accepts. A host round trip would also lose the one
 * thing `JSON.parse` is most often relied on for — that text it rejects is
 * rejected everywhere — and would quietly import whichever edition of
 * `Quote` the host implements.
 *
 * @param {Realm} realm
 * @returns {JSONIntrinsics}
 */
export function createJSONIntrinsics(realm) {
  const jsonObject = new EngineObject(realm.intrinsics.objectPrototype, 'JSON');

  const jsonParseFunction = realm.createNativeFunction({
    name: 'parse',
    length: 2,
    call(_thisValue, args) {
      return jsonParse(realm, args[0], args[1]);
    },
  });

  const jsonStringifyFunction = realm.createNativeFunction({
    name: 'stringify',
    length: 3,
    call(_thisValue, args) {
      return jsonStringify(realm, args[0], args[1], args[2]);
    },
  });

  /** @type {[string, NativeFunction][]} */
  const methods = [
    ['parse', jsonParseFunction],
    ['stringify', jsonStringifyFunction],
  ];

  for (const [name, method] of methods) {
    jsonObject.defineOwnProperty(name, {
      value: method,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  return { jsonObject, jsonParseFunction, jsonStringifyFunction };
}

/**
 * Publishes `JSON` on the global object with ES5 15.1's standard attributes.
 *
 * @param {EngineObject} globalObject
 * @param {JSONIntrinsics} intrinsics
 * @returns {void}
 */
export function installJSONObject(globalObject, intrinsics) {
  globalObject.defineOwnProperty('JSON', {
    value: intrinsics.jsonObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
